/**
 * §10's run controls, which are mostly a set of refusals.
 *
 * The interesting cases are all the ones where a control is asked for and the
 * answer is no: retrying a failure that will not come out differently, cancelling
 * something that already finished, re-running something still in flight. A
 * control that does the thing regardless is how a record stops matching what
 * happened.
 */
import { strict as assert } from 'node:assert';
import { after, before, beforeEach, test } from 'node:test';
import { Client } from 'pg';
import { cancelRun, retryRun, rerun } from './control.ts';
import { migrate } from './migrate.ts';

const owner = process.env['ORBIT_TEST_DATABASE_URL'] ?? `postgres://${process.env['USER']}@localhost/orbit2_test`;
let db: Client;
let versionId: string;

before(async () => { await migrate(owner); db = new Client({ connectionString: owner }); await db.connect(); });
after(async () => { await db?.end(); });

/** A run in whatever state the test needs, with a reference nobody else uses. */
async function aRun(status: string, extra: Record<string, unknown> = {}): Promise<string> {
  const reference = crypto.randomUUID().slice(0, 6).toUpperCase();
  await db.query(
    `INSERT INTO run (version_id, reference, status, inputs, error, ended_at)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [versionId, reference, status, JSON.stringify({ loanNumber: 'ML-1' }),
     extra['error'] ? JSON.stringify(extra['error']) : null,
     status === 'queued' || status === 'running' ? null : new Date()]);
  return reference;
}

beforeEach(async () => {
  const { rows: [w] } = await db.query<{ id: string }>(
    `INSERT INTO workflow (name, outcomes) VALUES ('Control', $1) RETURNING id`,
    [JSON.stringify([{ name: 'done', label: 'Done' }])]);
  const { rows: [v] } = await db.query<{ id: string }>(
    `INSERT INTO workflow_version (workflow_id, version, body, digest, outcomes, declared_inputs, applications)
     VALUES ($1, 1, '{"steps":[]}', $2, '[]', '[]', '[]') RETURNING id`,
    [w!.id, 'sha256:' + crypto.randomUUID().replaceAll('-', '')]);
  versionId = v!.id;
});

// ── cancel ────────────────────────────────────────────────────────────────

test('cancelling a running run asks, and does not declare it stopped', async () => {
  // The run is still being driven by a browser somewhere. Marking it cancelled
  // now would be a record that disagrees with the world.
  const reference = await aRun('running');
  assert.equal((await cancelRun(db as never, reference)).ok, true);

  const { rows } = await db.query<{ status: string; cancel_requested_at: string | null }>(
    `SELECT status, cancel_requested_at FROM run WHERE reference = $1`, [reference]);
  assert.equal(rows[0]!.status, 'running', 'still running until it reaches a safe boundary');
  assert.ok(rows[0]!.cancel_requested_at, 'but the request is recorded for the executor to find');
});

test('cancelling a queued run stops it outright, because nothing is in flight', async () => {
  const reference = await aRun('queued');
  assert.equal((await cancelRun(db as never, reference)).ok, true);

  const { rows } = await db.query<{ status: string; error: unknown; ended_at: string | null }>(
    `SELECT status, error, ended_at FROM run WHERE reference = $1`, [reference]);
  assert.equal(rows[0]!.status, 'cancelled');
  assert.ok(rows[0]!.ended_at, 'and it has ended');
  // Being stopped on purpose is not a failure. The schema enforces this too —
  // only a failed run may carry an error — so a cancelled run that recorded
  // one would put a technical fault where a person's decision belongs.
  assert.equal(rows[0]!.error, null, 'with nothing to diagnose');
});

test('a run that already finished cannot be cancelled', async () => {
  const reference = await aRun('succeeded');
  const result = await cancelRun(db as never, reference);
  assert.equal(result.ok, false);
  assert.match(result.ok === false ? result.because : '', /succeeded, so there is nothing to stop/);
});

// ── retry ─────────────────────────────────────────────────────────────────

test('a failure that could come out differently is retried in the same run', async () => {
  const reference = await aRun('failed', { error: { kind: 'applicationUnavailable', step: 2 } });
  assert.equal((await retryRun(db as never, reference)).ok, true);

  const { rows } = await db.query<{ status: string; retries: number; error: unknown; ended_at: string | null }>(
    `SELECT status, retries, error, ended_at FROM run WHERE reference = $1`, [reference]);
  assert.equal(rows[0]!.status, 'queued', 'back to the queue, not down a second execution path');
  assert.equal(rows[0]!.retries, 1);
  assert.equal(rows[0]!.error, null, 'the failure is cleared, because it is being re-attempted');
  assert.equal(rows[0]!.ended_at, null, 'and the run has not ended after all');
});

test('a failure that will not come out differently is refused, and says so', async () => {
  // Decision 12 makes ambiguity a refusal rather than a tie to break. A retry
  // is exactly the tie-break it refuses.
  const reference = await aRun('failed', { error: { kind: 'controlAmbiguous', step: 3 } });
  const result = await retryRun(db as never, reference);
  assert.equal(result.ok, false);
  assert.match(result.ok === false ? result.because : '', /will not come out differently/);

  const { rows } = await db.query<{ status: string }>(`SELECT status FROM run WHERE reference = $1`, [reference]);
  assert.equal(rows[0]!.status, 'failed', 'and it is left failed rather than quietly requeued');
});

test('a business condition that did not hold is not a technical failure to retry', async () => {
  const reference = await aRun('failed', { error: { kind: 'checkFailed', step: 4 } });
  assert.equal((await retryRun(db as never, reference)).ok, false);
});

test('evidence that failed its integrity check is never retried away', async () => {
  // Retrying replaces the question with a fresh attempt, which is how a
  // tampering signal gets lost.
  const reference = await aRun('failed', { error: { kind: 'integrityFailure', step: 1 } });
  assert.equal((await retryRun(db as never, reference)).ok, false);
});

test('a run that did not fail has no step to re-attempt', async () => {
  const reference = await aRun('succeeded');
  const result = await retryRun(db as never, reference);
  assert.equal(result.ok, false);
  assert.match(result.ok === false ? result.because : '', /no failed step to re-attempt/);
});

// ── re-run ────────────────────────────────────────────────────────────────

test('a re-run is a new run, with the same inputs, linked to the original', async () => {
  const reference = await aRun('failed', { error: { kind: 'controlAmbiguous', step: 3 } });
  const result = await rerun(db as never, reference);
  assert.equal(result.ok, true);
  assert.ok(result.ok === true && result.reference !== reference, 'a different run');

  const { rows } = await db.query<{ status: string; inputs: Record<string, string>; rerun_of: string }>(
    `SELECT r.status, r.inputs, r.rerun_of FROM run r WHERE r.reference = $1`,
    [result.ok === true ? result.reference : '']);
  assert.equal(rows[0]!.status, 'queued');
  assert.deepEqual(rows[0]!.inputs, { loanNumber: 'ML-1' }, 'the same inputs, not re-entered');

  const { rows: original } = await db.query<{ reference: string }>(
    `SELECT reference FROM run WHERE id = $1`, [rows[0]!.rerun_of]);
  assert.equal(original[0]!.reference, reference,
    'linked, so two attempts at the same work cannot be mistaken for two pieces of work');
});

test('a run that succeeded can be re-run, because doing it again is a normal thing to want', async () => {
  assert.equal((await rerun(db as never, await aRun('succeeded'))).ok, true);
});

test('a run still in flight cannot be re-run, because its inputs are not yet a settled fact', async () => {
  const result = await rerun(db as never, await aRun('running'));
  assert.equal(result.ok, false);
  assert.match(result.ok === false ? result.because : '', /has not finished yet/);
});

test('a re-run uses the version the original used, not whichever is live now', async () => {
  // A re-run that quietly picked up a newer version would not be a re-run of
  // anything.
  const reference = await aRun('failed', { error: { kind: 'checkFailed' } });
  const before = await db.query<{ version_id: string }>(
    `SELECT version_id FROM run WHERE reference = $1`, [reference]);
  const result = await rerun(db as never, reference);

  const { rows } = await db.query<{ version_id: string }>(
    `SELECT version_id FROM run WHERE reference = $1`, [result.ok === true ? result.reference : '']);
  assert.equal(rows[0]!.version_id, before.rows[0]!.version_id);
});
