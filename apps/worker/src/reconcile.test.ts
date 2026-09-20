/**
 * §10: an interrupted run is either resumed or failed with a typed error and
 * an event, **never left indefinitely in an unresolved state**. These stage
 * the three ways a worker can vanish and assert the run does not sit there.
 */
import { strict as assert } from 'node:assert';
import { after, before, test } from 'node:test';
import { Pool } from 'pg';
import { reconcile } from './reconcile.ts';

const url = process.env['ORBIT_TEST_DATABASE_URL'] ?? `postgres://${process.env['USER']}@localhost/orbit2_test`;
const pool = new Pool({ connectionString: url });
let versionId: string;

before(async () => {
  const { rows: [w] } = await pool.query<{ id: string }>(
    `INSERT INTO workflow (name) VALUES ('Reconcile') RETURNING id`);
  const { rows: [v] } = await pool.query<{ id: string }>(
    `INSERT INTO workflow_version (workflow_id, version, body, digest, outcomes, declared_inputs, applications)
     VALUES ($1, 1, '{}', 'sha256:r', '[]', '[]', '[]') RETURNING id`, [w!.id]);
  versionId = v!.id;
});
after(async () => { await pool.end(); });

/** A run whose lease died, optionally mid-attempt at a step of some kind. */
async function stranded(reference: string, midStep?: { kind: string; position: number }) {
  const { rows: [run] } = await pool.query<{ id: string }>(
    `INSERT INTO run (version_id, reference, status, inputs, claimed_by, lease_expires_at, started_at)
     VALUES ($1, $2, 'running', '{}', 'worker-gone', now() - interval '10 minutes', now() - interval '11 minutes')
     RETURNING id`, [versionId, reference]);
  if (midStep) {
    // Started and never ended: exactly what an interruption leaves behind.
    await pool.query(
      `INSERT INTO step_attempt (run_id, step_position, step_kind, attempt)
       VALUES ($1, $2, $3, 1)`, [run!.id, midStep.position, midStep.kind]);
  }
  return run!.id;
}

test('a run interrupted while reading is put back on the queue', async () => {
  const id = await stranded(`RC-${crypto.randomUUID().slice(0, 6)}`, { kind: 'read', position: 5 });
  const [resolved] = await reconcile(pool);
  assert.equal(resolved?.resolution, 'resumed');

  const { rows: [run] } = await pool.query<{ status: string; claimed_by: string | null }>(
    `SELECT status, claimed_by FROM run WHERE id = $1`, [id]);
  assert.equal(run!.status, 'queued', 'a read may be attempted again');
  assert.equal(run!.claimed_by, null, 'and the dead worker no longer holds it');

  // The first attempt is closed rather than rewritten: §10 records a second
  // attempt, it does not pretend the first did not happen.
  const { rows: [attempt] } = await pool.query<{ outcome: string }>(
    `SELECT outcome FROM step_attempt WHERE run_id = $1`, [id]);
  assert.equal(attempt!.outcome, 'interrupted');
});

test('a run interrupted while activating is failed, not retried', async () => {
  const id = await stranded(`RC-${crypto.randomUUID().slice(0, 6)}`, { kind: 'activate', position: 3 });
  const [resolved] = await reconcile(pool);
  assert.equal(resolved?.resolution, 'failed');

  const { rows: [run] } = await pool.query<{ status: string; error: { kind: string; step: number } }>(
    `SELECT status, error FROM run WHERE id = $1`, [id]);
  assert.equal(run!.status, 'failed');
  assert.equal(run!.error.kind, 'interruptedByRestart');
  assert.equal(run!.error.step, 3, 'and it names the step it stopped at');
  // Pressing a button may have changed something. Assuming it did not is the
  // guess rule 2 forbids, and it is the whole reason this is not a retry.
});

test('a run that never started goes back to the queue', async () => {
  const id = await stranded(`RC-${crypto.randomUUID().slice(0, 6)}`);
  const [resolved] = await reconcile(pool);
  assert.equal(resolved?.resolution, 'resumed');
  const { rows: [run] } = await pool.query<{ status: string }>(`SELECT status FROM run WHERE id = $1`, [id]);
  assert.equal(run!.status, 'queued');
});

test('every reconciliation leaves an event saying what was decided and why', async () => {
  await stranded(`RC-${crypto.randomUUID().slice(0, 6)}`, { kind: 'enter', position: 2 });
  const [resolved] = await reconcile(pool);
  const { rows: events } = await pool.query<{ kind: string; detail: { resolution: string; describe?: string } }>(
    `SELECT kind, detail FROM run_event WHERE run_id = $1 AND kind = 'run.reconciled'`, [resolved!.runId]);
  assert.equal(events.length, 1);
  assert.equal(events[0]!.detail.resolution, 'failed', 'entering a value may have changed something');
  assert.ok(events[0]!.detail.describe, 'and the event says why in the reader’s terms');
});

test('nothing is left running with a dead lease', async () => {
  await reconcile(pool);
  const { rows: [left] } = await pool.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM run
      WHERE status IN ('queued','running') AND lease_expires_at IS NOT NULL AND lease_expires_at < now()`);
  assert.equal(left!.n, 0, 'never left indefinitely in an unresolved state');
});
