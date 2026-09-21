/**
 * What may start a run.
 *
 * §4's gate on *which version* runs is unchanged: a run is refused from a
 * version that is not the live one, naming which condition applied, because
 * "silently running something other than what was asked for is
 * indistinguishable from running the wrong thing".
 *
 * The gate on *whether it may go live at all* is gone. Activation required
 * every declared ending to have been reached by a test run before a version
 * could touch a real system; publishing now sets the live version directly,
 * and a run is the proof. What is left here is pausing, archiving and version
 * precedence.
 */
import { strict as assert } from 'node:assert';
import { after, before, test } from 'node:test';
import { Client } from 'pg';
import { migrate } from './migrate.ts';
import { archive, mayStart, pause, resume, versionNeeds } from './activate.ts';

const owner = process.env['ORBIT_TEST_DATABASE_URL'] ?? `postgres://${process.env['USER']}@localhost/orbit2_test`;
let db: Client;
let workflowId: string;
let v1: string;
let v2: string;

const version = async (n: number) => {
  const { rows: [v] } = await db.query<{ id: string }>(
    `INSERT INTO workflow_version (workflow_id, version, body, digest, outcomes, declared_inputs, applications)
     VALUES ($1, $2, '{}', $3, $4, $5, '[]') RETURNING id`,
    [workflowId, n, `sha256:v${n}-${crypto.randomUUID().slice(0, 8)}`,
     JSON.stringify([{ name: 'found', label: 'Found' }]),
     JSON.stringify([{ name: 'reference', label: 'Reference', type: 'text', required: true }])]);
  return v!.id;
};

before(async () => {
  await migrate(owner);
  db = new Client({ connectionString: owner });
  await db.connect();
  const { rows: [w] } = await db.query<{ id: string }>(
    `INSERT INTO workflow (name) VALUES ($1) RETURNING id`, [`Gated ${crypto.randomUUID().slice(0, 6)}`]);
  workflowId = w!.id;
  v1 = await version(1);
  v2 = await version(2);
  await db.query(`UPDATE workflow SET live_version_id = $2 WHERE id = $1`, [workflowId, v1]);
});
after(async () => { await db?.end(); });

test('the live version may start', async () => {
  assert.equal((await mayStart(db as never, v1)).may, true);
});

test('a superseded version is refused rather than redirected to the live one', async () => {
  await db.query(`UPDATE workflow SET live_version_id = $2 WHERE id = $1`, [workflowId, v2]);
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

test('what a run needs is what the version declares, not what an author typed as an example', async () => {
  // The screen that starts a run used to read this off the test cases, which
  // meant the union of the example values somebody happened to fill in.
  const needs = await versionNeeds(db as never, v2);
  assert.deepEqual(needs?.inputs.map((i) => i.name), ['reference']);
  assert.deepEqual(needs?.outcomes.map((o) => o.name), ['found']);
});

test('a version nobody minted has no needs to report', async () => {
  assert.equal(await versionNeeds(db as never, crypto.randomUUID()), null);
});

test('retiring an agent stops every run and removes nothing', async () => {
  // Not a delete, and it cannot be one: versions, runs, evidence and model
  // calls are append-only. What is removed is the agent as a live thing.
  const { rows: [w] } = await db.query<{ id: string }>(
    `INSERT INTO workflow (name) VALUES ($1) RETURNING id`, [`Retire ${crypto.randomUUID().slice(0, 6)}`]);
  const { rows: [v] } = await db.query<{ id: string }>(
    `INSERT INTO workflow_version (workflow_id, version, body, digest, outcomes, declared_inputs, applications)
     VALUES ($1, 1, '{}', $2, $3, '[]', '[]') RETURNING id`,
    [w!.id, 'sha256:' + crypto.randomUUID().replaceAll('-', ''), JSON.stringify([{ name: 'found', label: 'Found' }])]);
  await db.query(`UPDATE workflow SET live_version_id = $2 WHERE id = $1`, [w!.id, v!.id]);
  assert.equal((await mayStart(db as never, v!.id)).may, true);

  await archive(db as never, w!.id, 'it never worked against the real portal');

  const may = await mayStart(db as never, v!.id);
  assert.equal(may.may, false);
  assert.match(may.because, /archived/);

  const { rows: kept } = await db.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM workflow_version WHERE workflow_id = $1`, [w!.id]);
  assert.equal(kept[0]!.n, 1, 'the version is still there');

  const { rows: [entry] } = await db.query<{ reason: string }>(
    `SELECT reason FROM audit_entry WHERE object_id = $1 AND act = 'agent archived'`, [w!.id]);
  assert.match(entry!.reason, /never worked/, 'the audit trail records why, not only that');
});

test('a retired agent is not listed', async () => {
  const { rows } = await db.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM workflow WHERE archived_at IS NOT NULL`);
  assert.ok(rows[0]!.n > 0, 'and the list query filters on archived_at');
});
