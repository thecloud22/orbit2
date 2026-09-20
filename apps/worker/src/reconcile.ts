/**
 * Resolving runs whose worker is gone.
 *
 * §10: "A run interrupted by a platform restart is **reconciled** on recovery:
 * it is either resumed or failed with a typed error and an event, never left
 * indefinitely in an unresolved state."
 *
 * Two things follow that are easy to get wrong.
 *
 * **A restart is not the only interruption.** A worker that crashes, or is
 * partitioned, announces nothing. So this runs on a timer as well as at
 * start-up, and it finds work by a dead lease rather than by a flag someone
 * remembered to clear (Decision 2 item 3).
 *
 * **Resuming defaults to halting.** An attempt that started and never ended
 * may or may not have landed its side effect. Where the step only reads,
 * replaying it is safe and the run continues with a second attempt recorded
 * rather than the first rewritten (§10). Where it may have changed something,
 * the run is failed with a typed error — guessing that a half-finished action
 * did not land is precisely what rule 2 forbids.
 */
import type { Pool } from 'pg';
import type { ErrorKind } from '@orbit/contract';

/** Steps whose repetition changes nothing, so a second attempt is safe. */
const REPLAYABLE = new Set(['open', 'read', 'collect', 'check', 'branch']);

export interface Reconciled {
  runId: string;
  reference: string;
  resolution: 'resumed' | 'failed';
  why: string;
}

export async function reconcile(pool: Pool, opts: { worker: string } = { worker: 'reconciler' }): Promise<Reconciled[]> {
  const { rows: stranded } = await pool.query<{
    id: string; reference: string; claimed_by: string | null;
    step_position: number | null; step_kind: string | null; attempt_id: string | null;
  }>(
    `SELECT r.id, r.reference, r.claimed_by,
            a.step_position, a.step_kind, a.id AS attempt_id
       FROM run r
       LEFT JOIN LATERAL (
         SELECT id, step_position, step_kind FROM step_attempt
          WHERE run_id = r.id AND ended_at IS NULL
          ORDER BY started_at DESC LIMIT 1
       ) a ON true
      WHERE r.status IN ('queued', 'running')
        AND r.lease_expires_at IS NOT NULL
        AND r.lease_expires_at < now()`);

  const resolved: Reconciled[] = [];

  for (const run of stranded) {
    // An attempt that started and never ended is exactly the interrupted
    // case, and it is found by a query rather than inferred.
    const interrupted = run.attempt_id !== null;
    const safeToReplay = !interrupted || REPLAYABLE.has(run.step_kind ?? '');

    if (safeToReplay) {
      if (interrupted) {
        await pool.query(
          `UPDATE step_attempt SET outcome = 'interrupted', ended_at = now() WHERE id = $1`,
          [run.attempt_id]);
      }
      await pool.query(
        `UPDATE run SET status = 'queued', claimed_by = NULL, lease_expires_at = NULL,
                        started_at = NULL WHERE id = $1`, [run.id]);
      await pool.query(
        `INSERT INTO run_event (run_id, kind, detail) VALUES ($1, 'run.reconciled', $2)`,
        [run.id, JSON.stringify({
          resolution: 'resumed', worker: run.claimed_by,
          replayedFrom: run.step_position,
          why: interrupted
            ? `step ${run.step_position} only reads, so it is safe to attempt again`
            : 'nothing had started, so the run returns to the queue',
        })]);
      resolved.push({ runId: run.id, reference: run.reference, resolution: 'resumed',
        why: interrupted ? `step ${run.step_position} (${run.step_kind}) is replayable` : 'not yet started' });
      continue;
    }

    // It may have changed something. Guessing it did not is the failure mode
    // rule 2 exists for, so the run stops and says so.
    const error: { kind: ErrorKind; step: number; describe: string } = {
      kind: 'interruptedByRestart',
      step: run.step_position ?? 0,
      describe: `The worker holding this run stopped while step ${run.step_position} was in progress. `
        + `A ${run.step_kind} step may have changed something, so it was not attempted again.`,
    };
    await pool.query(
      `UPDATE step_attempt SET outcome = 'interrupted', error = $2, ended_at = now() WHERE id = $1`,
      [run.attempt_id, JSON.stringify(error)]);
    await pool.query(
      `UPDATE run SET status = 'failed', error = $2, ended_at = now(),
                      claimed_by = NULL, lease_expires_at = NULL WHERE id = $1`,
      [run.id, JSON.stringify(error)]);
    await pool.query(
      `INSERT INTO run_event (run_id, kind, detail) VALUES ($1, 'run.reconciled', $2)`,
      [run.id, JSON.stringify({ resolution: 'failed', worker: run.claimed_by, ...error })]);
    await pool.query(
      `INSERT INTO audit_entry (act, object_kind, object_id, changed, run_id)
       VALUES ('run failed', 'run', $1, $2, $1)`,
      [run.id, JSON.stringify({ by: opts.worker, ...error })]);

    resolved.push({ runId: run.id, reference: run.reference, resolution: 'failed', why: error.describe });
  }

  return resolved;
}
