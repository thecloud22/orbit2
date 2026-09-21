/**
 * That the step kinds are surface-neutral by construction, not by assertion.
 *
 * Decision 2 asks that execution sit behind an interface "so a second surface
 * can be added without reopening the first", and Decision 5 item 9 says a step
 * never names a surface because §7 forbids a designer choosing a "browser
 * step". Both were true only because nobody had tried to add a second surface.
 *
 * A grep for `playwright` in `execute.ts` would not settle it either — it
 * shows what the file imports, not whether the step kinds depend on a browser.
 * So this drives a real run through a surface made of arrays. If `open`,
 * `enter`, `activate`, `read` and `end` all behave against something with no
 * DOM, no page and no browser, the claim holds.
 *
 * It is also how step semantics get tested at all without a browser, which is
 * worth more than the architectural point.
 */
import { strict as assert } from 'node:assert';
import { after, before, beforeEach, test } from 'node:test';
import type { Step } from '@orbit/contract';
import { Client } from 'pg';
import { migrate } from '../../api/src/migrate.ts';
import { execute } from './execute.ts';
import type { Found, Sought, Surface } from './surface.ts';

const owner = process.env['ORBIT_TEST_DATABASE_URL'] ?? `postgres://${process.env['USER']}@localhost/orbit2_test`;
let db: Client;
let runId: string;

before(async () => { await migrate(owner); db = new Client({ connectionString: owner }); await db.connect(); });
after(async () => { await db?.end(); });

beforeEach(async () => {
  const { rows: [w] } = await db.query<{ id: string }>(
    `INSERT INTO workflow (name, outcomes) VALUES ('Paper', $1) RETURNING id`,
    [JSON.stringify([{ name: 'found', label: 'Found' }])]);
  const { rows: [v] } = await db.query<{ id: string }>(
    `INSERT INTO workflow_version (workflow_id, version, body, digest, outcomes, declared_inputs, applications)
     VALUES ($1, 1, '{"steps":[]}', $2, '[]', '[]', '[]') RETURNING id`,
    [w!.id, 'sha256:' + crypto.randomUUID().replaceAll('-', '')]);
  const { rows: [r] } = await db.query<{ id: string }>(
    `INSERT INTO run (version_id, reference, status, inputs) VALUES ($1, $2, 'running', '{}') RETURNING id`,
    [v!.id, crypto.randomUUID().slice(0, 6).toUpperCase()]);
  runId = r!.id;
});

/**
 * A surface with nothing behind it but a record of what it was asked to do.
 *
 * It answers `find` from a map of label to text, so a step can be resolved,
 * filled, activated and read without anything being rendered anywhere.
 */
function paperSurface(present: Record<string, string>) {
  const did: string[] = [];
  const surface: Surface & { did: string[] } = {
    kind: 'service',
    did,
    open: async (path) => { did.push(`open ${path}`); },
    settle: async () => { did.push('settle'); },
    capture: async () => ({ bytes: Buffer.from('a page, as it were'), mediaType: 'text/plain' }),
    close: async () => { did.push('close'); },
    find: async (binding): Promise<Sought> => {
      const name = (binding as { name?: string }).name ?? '';
      if (!(name in present)) return { found: 'none', by: binding.strategy };
      const it: Found = {
        by: binding.strategy,
        fill: async (value) => { did.push(`fill ${name}=${value}`); },
        activate: async () => { did.push(`activate ${name}`); },
        text: async () => present[name]!,
      };
      return { found: 'one', it };
    },
  };
  return surface;
}

const byName = (name: string) => ({ strategy: 'roleAndName' as const, role: 'textbox', name });

test('a run completes against a surface that is not a browser', async () => {
  const ids = Array.from({ length: 5 }, () => crypto.randomUUID());
  const steps: Step[] = [
    { id: ids[0]!, kind: 'open', summary: 'open the register', application: 'register', path: '/register',
      arrives: { describe: 'the register is open' }, changesARecord: false },
    { id: ids[1]!, kind: 'enter', summary: 'the reference', into: { label: 'Reference', binding: byName('Reference') },
      value: { from: 'literal', literal: { type: 'text', text: 'SR-4417' } }, sensitive: false },
    { id: ids[2]!, kind: 'activate', summary: 'look it up',
      control: { label: 'Find', binding: byName('Find') },
      then: { describe: 'the file is shown' }, changesARecord: false },
    { id: ids[3]!, kind: 'read', summary: 'the note rate', region: { label: 'Note rate', binding: byName('Note rate') },
      produces: { name: 'noteRate', label: 'Note rate', type: 'text', required: true } },
    { id: ids[4]!, kind: 'end', summary: 'found it', outcome: 'found', publishes: ['noteRate'] },
  ];

  const surface = paperSurface({ Reference: '', Find: '', 'Note rate': '6.375%' });
  const result = await execute(db as never, runId, steps, {}, surface);

  assert.equal(result.halted, null, 'nothing about these five kinds needs a browser');
  assert.equal(result.reached, 'found', 'and it reached the ending it was meant to');
  assert.equal(result.values.get('noteRate'), '6.375%', 'having read the value off the surface');

  assert.deepEqual(surface.did, [
    'open /register',
    'fill Reference=SR-4417',
    'activate Find',
    'settle',
    'close',
  ], 'and asked the surface only for things any surface could do');
});

test('evidence is captured from the surface, whatever the surface is made of', async () => {
  // The store addresses content rather than trusting a file extension, so a
  // surface whose evidence is not a PNG is not a special case.
  const steps: Step[] = [
    { id: crypto.randomUUID(), kind: 'open', summary: 'open it', application: 'register', path: '/register',
      arrives: { describe: 'it is open' }, changesARecord: false },
    { id: crypto.randomUUID(), kind: 'end', summary: 'done', outcome: 'found', publishes: [] },
  ];
  await execute(db as never, runId, steps, {}, paperSurface({}));

  const { rows } = await db.query<{ media_type: string; bytes: number }>(
    `SELECT media_type, bytes FROM artefact WHERE run_id = $1`, [runId]);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]!.media_type, 'text/plain', 'recorded as what it is, not as a screenshot');
});

test('a control the surface cannot find halts the run rather than guessing', async () => {
  const steps: Step[] = [
    { id: crypto.randomUUID(), kind: 'activate', summary: 'press it',
      control: { label: 'Approve', binding: byName('Approve') },
      then: { describe: 'it is approved' }, changesARecord: false },
    { id: crypto.randomUUID(), kind: 'end', summary: 'done', outcome: 'found', publishes: [] },
  ];

  const result = await execute(db as never, runId, steps, {}, paperSurface({}));
  assert.equal(result.halted?.kind, 'controlNotFound');
  assert.equal(result.halted?.step, 1);
});
