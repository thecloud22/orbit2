/**
 * The worker: claims a queued run, executes it, records what happened.
 *
 * It claims with a lease rather than a flag, so a worker that dies is found by
 * a sweep rather than by a restart (Decision 2). Slice 1 runs one worker; the
 * lease is what makes a second a deployment change rather than a redesign.
 */
import { Pool } from 'pg';
import { step as stepSchema, type Step } from '@orbit/contract';
import { execute } from './execute.ts';
import { reconcile } from './reconcile.ts';

const pool = new Pool({
  connectionString: process.env['ORBIT_DATABASE_URL']
    ?? `postgres://orbit_app:orbit_app_local_only@localhost/orbit2_dev`,
});
const worker = `worker-${process.pid}`;

async function claimOne(): Promise<string | null> {
  const { rows } = await pool.query<{ id: string }>(
    `UPDATE run SET status = 'running', started_at = now(),
            claimed_by = $1, lease_expires_at = now() + interval '5 minutes'
      WHERE id = (SELECT id FROM run
                   WHERE status = 'queued'
                     AND (lease_expires_at IS NULL OR lease_expires_at < now())
                   ORDER BY queued_at FOR UPDATE SKIP LOCKED LIMIT 1)
      RETURNING id`, [worker]);
  return rows[0]?.id ?? null;
}

async function runOne(runId: string) {
  const db = await pool.connect();
  try {
    const { rows: [row] } = await db.query(
      `SELECT r.reference, r.inputs, v.body, v.applications
         FROM run r JOIN workflow_version v ON v.id = r.version_id WHERE r.id = $1`, [runId]);
    // Validated coming out of the store as well as going in: persistence is a
    // boundary like any other (Decision 9).
    const steps: Step[] = (row.body.steps as unknown[]).map((s) => stepSchema.parse(s));
    const app = row.applications[0];
    const origin = `http://${app.addresses[0].host}`;

    await db.query(`INSERT INTO run_event (run_id, kind, detail) VALUES ($1, 'run.started', $2)`,
      [runId, JSON.stringify({ worker, origin })]);
    console.log(`  ${row.reference}: ${steps.length} steps against ${origin}`);

    const { halted, values, reached } = await execute(db, runId, steps, row.inputs, origin);

    if (halted) {
      // Cancelling is a decision, not a fault. §13 records a cancelled run as
      // cancelled, and the schema allows an error only on a failure, so the
      // two agree: what stopped it is the status, and there is nothing to
      // diagnose. Recording a person's decision as a technical failure would
      // put a fault on the record where a choice belongs.
      const stopped = halted.kind === 'cancelled';
      if (stopped) {
        await db.query(`UPDATE run SET status = 'cancelled', ended_at = now() WHERE id = $1`, [runId]);
      } else {
        await db.query(
          `UPDATE run SET status = 'failed', error = $2, ended_at = now() WHERE id = $1`,
          [runId, JSON.stringify(halted)]);
      }
      await db.query(`INSERT INTO run_event (run_id, kind, detail) VALUES ($1, $2, $3)`,
        [runId, stopped ? 'run.cancelled' : 'run.failed', JSON.stringify(halted)]);
      console.log(`  ${row.reference}: ${stopped ? 'cancelled' : 'halted'} — ${halted.describe}`);
      return;
    }

    // The conclusion is the ending the run actually reached — not the last
    // step in the list, which is simply the one written last. The technical
    // status is a separate fact and is never merged with it (§10).
    const outcome = reached;
    const outputs = Object.fromEntries(values);
    await db.query(
      `UPDATE run SET status = 'succeeded', outcome = $2, outputs = $3, ended_at = now() WHERE id = $1`,
      [runId, outcome, JSON.stringify(outputs)]);
    await db.query(`INSERT INTO run_event (run_id, kind, detail) VALUES ($1, 'run.succeeded', $2)`,
      [runId, JSON.stringify({ outcome })]);
    console.log(`  ${row.reference}: succeeded — ${outcome}`);
  } finally {
    db.release();
  }
}

const once = process.argv.includes('--once');
console.log(`orbit worker ${worker}${once ? ' (one run, then stop)' : ''}`);

// At start-up, and then on a timer. A restart is not the only interruption: a
// worker that crashes or is partitioned announces nothing, so stranded runs
// are found by a dead lease rather than by an event anybody sent.
async function sweep() {
  for (const r of await reconcile(pool, { worker })) {
    console.log(`  reconciled ${r.reference}: ${r.resolution} — ${r.why}`);
  }
}
await sweep();
const sweeping = setInterval(() => { void sweep(); }, 30_000);
sweeping.unref();

for (;;) {
  const runId = await claimOne();
  if (runId) await runOne(runId);
  else if (once) break;
  if (once && runId) break;
  if (!runId) await new Promise((r) => setTimeout(r, 1000));
}
await pool.end();
