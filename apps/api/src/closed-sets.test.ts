/**
 * The database refuses a vocabulary it does not know, and refuses a run whose
 * status and error disagree. Both are written onto rows that are never edited,
 * so a typo would become a permanent fact — this is the only moment it can
 * still be caught.
 */
import { strict as assert } from 'node:assert';
import { after, before, test } from 'node:test';
import { Client } from 'pg';
import { migrate } from './migrate.ts';

const owner = process.env['ORBIT_TEST_DATABASE_URL'] ?? `postgres://${process.env['USER']}@localhost/orbit2_test`;
let db: Client;
let runId: string;

before(async () => {
  await migrate(owner);
  db = new Client({ connectionString: owner });
  await db.connect();
  const wf = await db.query<{ id: string }>(`INSERT INTO workflow (name) VALUES ('t') RETURNING id`);
  const v = await db.query<{ id: string }>(
    `INSERT INTO workflow_version (workflow_id, version, body, digest, outcomes, declared_inputs, applications)
     VALUES ($1, 1, '{}', 'sha256:x', '[]', '[]', '[]') RETURNING id`, [wf.rows[0]!.id]);
  const r = await db.query<{ id: string }>(
    `INSERT INTO run (version_id, reference, status, inputs)
     VALUES ($1, 'C-' || substr(gen_random_uuid()::text,1,6), 'running', '{}') RETURNING id`, [v.rows[0]!.id]);
  runId = r.rows[0]!.id;
});
after(async () => { await db?.end(); });

test('an event kind outside the set is refused', async () => {
  await db.query(`INSERT INTO run_event (run_id, kind) VALUES ($1, 'branch.evaluated')`, [runId]);
  await assert.rejects(
    () => db.query(`INSERT INTO run_event (run_id, kind) VALUES ($1, 'branch.evaluted')`, [runId]),
    /run_event_kind_known/, 'a typo must not become a permanent fact');
});

test('an error kind outside the set is refused', async () => {
  await assert.rejects(
    () => db.query(`UPDATE run SET status='failed', error='{"kind":"somethingWentWrong","step":1}' WHERE id=$1`, [runId]),
    /run_error_kind_known/);
});

test('a succeeded run cannot carry an error', async () => {
  // §10: a run that correctly established a record does not exist has
  // succeeded, and carries none. The database will not let the two disagree.
  await assert.rejects(
    () => db.query(`UPDATE run SET status='succeeded', error='{"kind":"timedOut","step":1}' WHERE id=$1`, [runId]),
    /run_error_only_when_failed/);
  await db.query(`UPDATE run SET status='succeeded', outcome='noSuchRecord', error=NULL WHERE id=$1`, [runId]);
});

test('a failed run must say what kind of failure', async () => {
  await assert.rejects(
    () => db.query(`UPDATE run SET status='failed', error=NULL WHERE id=$1`, [runId]),
    /run_error_only_when_failed/);
});
