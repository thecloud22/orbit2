/**
 * §4's gates: activation is on evidence rather than assertion, and a run is
 * refused from a version that is not the live one — naming which condition
 * applied, because "silently running something other than what was asked for
 * is indistinguishable from running the wrong thing".
 */
import { strict as assert } from 'node:assert';
import { after, before, test } from 'node:test';
import { Client } from 'pg';
import { migrate } from './migrate.ts';
import { activate, mayStart, pause, resume } from './activate.ts';

const owner = process.env['ORBIT_TEST_DATABASE_URL'] ?? `postgres://${process.env['USER']}@localhost/orbit2_test`;
let db: Client;
let workflowId: string;
let v1: string;
let v2: string;

/** A reference nothing else will pick. A test that only passes against a fresh
 *  database is a test nobody runs twice, and one nobody runs twice is one
 *  nobody trusts. */
const reference = (prefix: string) => `${prefix}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`;

const version = async (n: number) => {
  const { rows: [v] } = await db.query<{ id: string }>(
    `INSERT INTO workflow_version (workflow_id, version, body, digest, outcomes, declared_inputs, applications)
     VALUES ($1, $2, '{}', $3, $4, '[]', '[]') RETURNING id`,
    [workflowId, n, `sha256:v${n}`, JSON.stringify([{ name: 'found', label: 'Found' }])]);
  return v!.id;
};

before(async () => {
  await migrate(owner);
  db = new Client({ connectionString: owner });
  await db.connect();
  const { rows: [w] } = await db.query<{ id: string }>(
    `INSERT INTO workflow (name, examples) VALUES ('Gated', $1) RETURNING id`,
    [JSON.stringify({ found: { reference: 'SR-1' } })]);
  workflowId = w!.id;
  v1 = await version(1);
  v2 = await version(2);
});
after(async () => { await db?.end(); });

test('an ending nothing has reached cannot be signed off', async () => {
  const refused = await activate(db as never, v1);
  assert.equal(refused.outcome, 'refused');
  assert.deepEqual(refused.unproved, ['Found']);
});

test('a version nobody activated cannot be started', async () => {
  const may = await mayStart(db as never, v1);
  assert.equal(may.may, false);
  assert.match(may.because, /has been activated/);
});

test('a test run that reached the ending is what proves it', async () => {
  await db.query(
    `INSERT INTO run (version_id, reference, status, outcome, is_test, inputs, ended_at)
     VALUES ($1, $2, 'succeeded', 'found', true, '{}', now())`, [v1, reference('T')]);
  const activated = await activate(db as never, v1);
  assert.equal(activated.outcome, 'activated');
  assert.equal(activated.version, 1);
  assert.equal((await mayStart(db as never, v1)).may, true);
});

test('a superseded version is refused rather than redirected to the live one', async () => {
  await db.query(
    `INSERT INTO run (version_id, reference, status, outcome, is_test, inputs, ended_at)
     VALUES ($1, $2, 'succeeded', 'found', true, '{}', now())`, [v2, reference('T')]);
  await activate(db as never, v2);

  const may = await mayStart(db as never, v1);
  assert.equal(may.may, false);
  assert.match(may.because, /superseded/);
  // Not silently sent to version 2. Running something other than what was
  // asked for is indistinguishable from running the wrong thing.
});

test('pausing stops new runs and says so; resuming puts it back', async () => {
  await pause(db as never, workflowId, 'the portal is down for maintenance');
  const paused = await mayStart(db as never, v2);
  assert.equal(paused.may, false);
  assert.match(paused.because, /paused/);

  await resume(db as never, workflowId);
  assert.equal((await mayStart(db as never, v2)).may, true);
});

test('an archived agent starts nothing, and keeps everything', async () => {
  await db.query(`UPDATE workflow SET archived_at = now() WHERE id = $1`, [workflowId]);
  const may = await mayStart(db as never, v2);
  assert.equal(may.may, false);
  assert.match(may.because, /archived/);

  const { rows } = await db.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM workflow_version WHERE workflow_id = $1`, [workflowId]);
  assert.equal(rows[0]!.n, 2, 'archiving retires an identity; it never removes a version');
});
