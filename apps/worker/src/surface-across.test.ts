/**
 * A run across two applications (Orbit 2.2, C12, C14): each step goes to the
 * application with focus, a second `open` of an application only moves focus
 * back to it, the account follows focus, and a record-changing press that was
 * never answered is said to be unknown, against its application.
 */
import { strict as assert } from 'node:assert';
import { after, before, beforeEach, test } from 'node:test';
import type { Step } from '@orbit/contract';
import { Client } from 'pg';
import { migrate } from '../../api/src/migrate.ts';
import { execute } from './execute.ts';
import { surfaceAcross } from './surface-across.ts';
import type { Found, Surface } from './surface.ts';

const owner = process.env['ORBIT_TEST_DATABASE_URL'] ?? `postgres://${process.env['USER']}@localhost/orbit2_test`;
let db: Client;
let runId: string;

before(async () => { await migrate(owner); db = new Client({ connectionString: owner }); await db.connect(); });
after(async () => { await db?.end(); });
beforeEach(async () => {
  const { rows: [w] } = await db.query<{ id: string }>(`INSERT INTO workflow (name, outcomes) VALUES ('Across', '[]') RETURNING id`);
  const { rows: [v] } = await db.query<{ id: string }>(
    `INSERT INTO workflow_version (workflow_id, version, body, digest, outcomes, declared_inputs, applications)
     VALUES ($1, 1, '{"steps":[]}', $2, '[]', '[]', '[]') RETURNING id`, [w!.id, 'sha256:' + crypto.randomUUID().replaceAll('-', '')]);
  const { rows: [r] } = await db.query<{ id: string }>(
    `INSERT INTO run (version_id, reference, status, inputs) VALUES ($1, $2, 'running', '{}') RETURNING id`,
    [v!.id, crypto.randomUUID().slice(0, 6).toUpperCase()]);
  runId = r!.id;
});

/** A fake application: records what was done to it, and can be told to drop a press. */
function fake(name: string, log: string[], opts: { dropOn?: string; values?: Record<string, string> } = {}): Surface {
  return {
    kind: 'browser',
    open: async (path) => { log.push(`${name} opened ${path}`); },
    settle: async () => { if (log.at(-1) === `${name} pressed ${opts.dropOn}`) throw new Error('connection reset: timed out'); },
    capture: async () => ({ bytes: Buffer.from('x'), mediaType: 'image/png' }),
    close: async () => { log.push(`${name} closed`); },
    find: async (binding) => {
      const label = (binding as { name?: string }).name ?? '';
      const it: Found = {
        by: 'roleAndName',
        fill: async (v) => { log.push(`${name} typed ${v} into ${label}`); },
        activate: async () => { log.push(`${name} pressed ${label}`); },
        text: async () => opts.values?.[label] ?? '',
        where: async () => null,
      };
      return { found: 'one', it };
    },
  };
}

const id = () => crypto.randomUUID();
const open = (application: string, path = '/'): Step => ({ id: id(), kind: 'open', summary: `open ${application}`, application, path,
  arrives: { describe: 'open' }, changesARecord: false });
const target = (name: string) => ({ label: name, binding: { strategy: 'roleAndName', name } });

test('each step goes to the application with focus, and going back is not a navigation', async () => {
  const log: string[] = [];
  const surface = surfaceAcross([
    { name: 'Web', origin: 'http://web', open: async () => fake('web', log, { values: { Rate: '6.375%' } }), signsInAs: 'admin' },
    { name: 'Servicing', origin: 'tn3270://svc', open: async () => fake('svc', log), signsInAs: 'SVCUSER' },
  ]);
  const steps: Step[] = [
    open('Web', '/login'),
    { id: id(), kind: 'enter', summary: 'user', into: target('User'), value: { from: 'account' }, sensitive: false },
    { id: id(), kind: 'read', summary: 'rate', region: target('Rate'), produces: { name: 'noteRate', label: 'Rate', type: 'text', required: true } },
    open('Servicing'),
    { id: id(), kind: 'enter', summary: 'user', into: target('USERID'), value: { from: 'account' }, sensitive: false },
    { id: id(), kind: 'enter', summary: 'rate', into: target('NOTE RATE'), value: { from: 'step', value: 'noteRate' }, sensitive: false },
    { id: id(), kind: 'activate', summary: 'submit', control: target('SUBMIT'), then: { describe: 'boarded' }, changesARecord: true },
    open('Web', '/login'),
    { id: id(), kind: 'activate', summary: 'save', control: target('Save'), then: { describe: 'saved' }, changesARecord: true },
    { id: id(), kind: 'end', summary: 'done', outcome: 'boarded', publishes: [] },
  ];
  const run = await execute(db as never, runId, steps, {}, surface);
  assert.equal(run.halted, null);
  assert.equal(run.reached, 'boarded');
  assert.deepEqual(log.filter((l) => !l.endsWith('closed')), [
    'web opened /login', 'web typed admin into User',
    'svc opened /', 'svc typed SVCUSER into USERID', 'svc typed 6.375% into NOTE RATE', 'svc pressed SUBMIT',
    'web pressed Save',
  ], 'the second open of Web moved focus back without opening it again');
  assert.ok(log.includes('web closed') && log.includes('svc closed'));
});

test('a record-changing press that was never answered is unknown, with what was changed before it', async () => {
  const log: string[] = [];
  const surface = surfaceAcross([
    { name: 'Web', origin: 'http://web', open: async () => fake('web', log), signsInAs: null },
    { name: 'Servicing', origin: 'tn3270://svc', open: async () => fake('svc', log, { dropOn: 'SUBMIT' }), signsInAs: null },
  ]);
  const steps: Step[] = [
    open('Web'),
    { id: id(), kind: 'activate', summary: 'approve', control: target('Approve'), then: { describe: 'approved' }, changesARecord: true },
    open('Servicing'),
    { id: id(), kind: 'activate', summary: 'submit', control: target('SUBMIT'), then: { describe: 'boarded' }, changesARecord: true },
    { id: id(), kind: 'end', summary: 'done', outcome: 'boarded', publishes: [] },
  ];
  const { halted } = await execute(db as never, runId, steps, {}, surface);
  assert.equal(halted?.kind, 'timedOut');
  assert.equal(halted?.step, 4);
  assert.deepEqual(halted?.partial, {
    changed: [{ application: 'Web', step: 2, control: 'Approve' }],
    unknown: { application: 'Servicing', step: 4, control: 'SUBMIT' },
  });
  const { rows: [open_] } = await db.query(`SELECT count(*)::int AS n FROM step_attempt WHERE run_id = $1 AND ended_at IS NULL`, [runId]);
  assert.equal(open_.n, 0, 'no attempt is left open');
});
