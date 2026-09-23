/**
 * That a driver which throws ends the run rather than the worker.
 *
 * `execute` halts with a typed error for everything it decides. The driver
 * underneath it throws on its own account — a page that will not load, a
 * browser that dies — and a single `page.goto` timeout took the whole worker
 * process down mid-suite, leaving the run it was doing marked `running` with
 * no error on it and every queued run behind it stopped.
 */
import { strict as assert } from 'node:assert';
import { after, before, beforeEach, test } from 'node:test';
import type { Step } from '@orbit/contract';
import { Client } from 'pg';
import { migrate } from '../../api/src/migrate.ts';
import { execute } from './execute.ts';
import type { Surface } from './surface.ts';

const owner = process.env['ORBIT_TEST_DATABASE_URL'] ?? `postgres://${process.env['USER']}@localhost/orbit2_test`;
let db: Client;
let runId: string;

before(async () => { await migrate(owner); db = new Client({ connectionString: owner }); await db.connect(); });
after(async () => { await db?.end(); });

beforeEach(async () => {
  const { rows: [w] } = await db.query<{ id: string }>(
    `INSERT INTO workflow (name, outcomes) VALUES ('Throwing', '[]') RETURNING id`);
  const { rows: [v] } = await db.query<{ id: string }>(
    `INSERT INTO workflow_version (workflow_id, version, body, digest, outcomes, declared_inputs, applications)
     VALUES ($1, 1, '{"steps":[]}', $2, '[]', '[]', '[]') RETURNING id`,
    [w!.id, 'sha256:' + crypto.randomUUID().replaceAll('-', '')]);
  const { rows: [r] } = await db.query<{ id: string }>(
    `INSERT INTO run (version_id, reference, status, inputs) VALUES ($1, $2, 'running', '{}') RETURNING id`,
    [v!.id, crypto.randomUUID().slice(0, 6).toUpperCase()]);
  runId = r!.id;
});

/** A surface whose `open` fails the way Playwright's does. */
const wontLoad = (): Surface => ({
  kind: 'browser',
  open: async () => { throw new Error('page.goto: Timeout 30000ms exceeded.\nCall log:\n  - navigating'); },
  settle: async () => undefined,
  capture: async () => ({ bytes: Buffer.from(''), mediaType: 'text/plain' }),
  close: async () => undefined,
  find: async () => ({ found: 'none', by: 'roleAndName' }),
});

test('a driver that throws halts the run at the step it was on, named, rather than escaping', async () => {
  // It used to escape to the worker, which recorded it at "step 0" with the
  // step's attempt left open for the lease sweep to find (pilot-readiness,
  // "a driver that throws escapes the typed-error channel"). Orbit 2.2 halts
  // it where it happened, with the kind the driver named or the message implies.
  const steps: Step[] = [
    { id: crypto.randomUUID(), kind: 'open', summary: 'open it', application: 'app', path: '/login',
      arrives: { describe: 'it is open' }, changesARecord: false },
    { id: crypto.randomUUID(), kind: 'end', summary: 'done', outcome: 'done', publishes: [] },
  ];
  const { halted } = await execute(db as never, runId, steps, {}, wontLoad());
  assert.equal(halted?.kind, 'timedOut');
  assert.equal(halted?.step, 1);
  assert.match(halted?.describe ?? '', /Timeout 30000ms exceeded/);
});
