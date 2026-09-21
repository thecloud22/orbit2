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
import { modelFromEnvironment } from '@orbit/model';
import { authorAndStore } from './author-store.ts';
import { openBrowser } from './surface-browser.ts';
import type { OpenSurface } from './surface.ts';

/**
 * Which driver each surface is executed through.
 *
 * Decision 5 item 9: a step never names a surface, so the surface is chosen
 * here, at run time, from what the version copied about the application. A
 * table rather than a branch, so that adding the terminal is a line here and a
 * file beside `surface-browser.ts` — which is the whole of what Decision 2
 * asked for when it said a second surface must not reopen the first.
 */
const SURFACES: Partial<Record<string, OpenSurface>> = {
  browser: openBrowser,
};

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

/**
 * An authoring session, claimed the same way a run is.
 *
 * It lives here rather than in the API because Decision 2 puts the browser in
 * the worker, and the alternative — a second browser behind the API — is the
 * thing that decision exists to prevent.
 */
async function claimAuthoring(): Promise<string | null> {
  const { rows } = await pool.query<{ id: string }>(
    `UPDATE authoring_session SET status = 'running',
            claimed_by = $1, lease_expires_at = now() + interval '10 minutes'
      WHERE id = (SELECT id FROM authoring_session
                   WHERE status = 'queued'
                     AND (lease_expires_at IS NULL OR lease_expires_at < now())
                   ORDER BY queued_at FOR UPDATE SKIP LOCKED LIMIT 1)
      RETURNING id`, [worker]);
  return rows[0]?.id ?? null;
}

async function authorOne(sessionId: string) {
  const db = await pool.connect();
  try {
    const { rows: [s] } = await db.query<{
      name: string; procedure: string; application_id: string; start_path: string;
      inputs: Record<string, string>; host: string;
    }>(`SELECT s.name, s.procedure, s.application_id, s.start_path, s.inputs,
               (r.addresses->0->>'host') AS host
          FROM authoring_session s
          JOIN application_revision r ON r.application_id = s.application_id
         WHERE s.id = $1
         ORDER BY r.revision DESC LIMIT 1`, [sessionId]);
    if (!s) return;

    console.log(`  bringing in "${s.name}" against http://${s.host}`);
    const result = await authorAndStore(db, {
      name: s.name,
      procedure: s.procedure,
      applicationId: s.application_id,
      origin: `http://${s.host}`,
      startPath: s.start_path,
      inputs: s.inputs,
      model: modelFromEnvironment(),
    });

    if (result.stored === false) {
      // Criterion 2: nothing was stored, and the reason is carried back rather
      // than logged where the person who asked will never see it.
      await db.query(
        `UPDATE authoring_session SET status = 'refused', refused = $2, ended_at = now() WHERE id = $1`,
        [sessionId, JSON.stringify({ describe: result.describe, problems: result.problems })]);
      console.log(`  refused: ${result.describe}`);
      return;
    }

    await db.query(
      `UPDATE authoring_session SET status = 'brought in', workflow_id = $2, ended_at = now() WHERE id = $1`,
      [sessionId, result.workflowId]);
    console.log(`  brought in: ${result.draft.steps.length} steps, ${result.draft.turns.length} turns`);
  } catch (error) {
    // A walk that threw is a refusal with a reason, not a session left looking
    // busy until its lease expires.
    await db.query(
      `UPDATE authoring_session SET status = 'refused', refused = $2, ended_at = now() WHERE id = $1`,
      [sessionId, JSON.stringify({ describe: `Orbit could not work through this: ${String(error)}` })]);
    console.log(`  refused: ${String(error)}`);
  } finally {
    db.release();
  }
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

    // Read from the version's own copy, never from the live application: a
    // version that could be made to run somewhere else by editing a row
    // afterwards would not be the fixed thing every run names.
    const open = SURFACES[app.surface];
    if (!open) {
      // Orbit does not guess what it is driving. A version that does not say
      // is refused rather than assumed to be a browser, because assuming is
      // how a terminal procedure would one day be run against a web page and
      // the record would say it went fine.
      const halt = { kind: 'pathReachesNothing' as const, step: 1,
        describe: app.surface
          ? `This version is registered against a ${app.surface} surface, which this worker cannot drive.`
          : 'This version does not record what kind of application it runs against, so it cannot be run.' };
      await db.query(`UPDATE run SET status = 'failed', error = $2, ended_at = now() WHERE id = $1`,
        [runId, JSON.stringify(halt)]);
      await db.query(`INSERT INTO run_event (run_id, kind, detail) VALUES ($1, 'run.failed', $2)`,
        [runId, JSON.stringify(halt)]);
      console.log(`  ${row.reference}: ${halt.describe}`);
      return;
    }

    await db.query(`INSERT INTO run_event (run_id, kind, detail) VALUES ($1, 'run.started', $2)`,
      [runId, JSON.stringify({ worker, origin, surface: app.surface })]);
    console.log(`  ${row.reference}: ${steps.length} steps against ${origin} (${app.surface})`);

    const { halted, values, reached } = await execute(
      db, runId, steps, row.inputs, await open(origin));

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
  // Runs first. An authoring session is somebody waiting at a screen, but a
  // run is an agent that was already allowed to start, and letting authoring
  // hold one up would make the queue answer to whoever asked most recently.
  const runId = await claimOne();
  if (runId) { await runOne(runId); if (once) break; continue; }

  const sessionId = await claimAuthoring();
  if (sessionId) { await authorOne(sessionId); if (once) break; continue; }

  if (once) break;
  await new Promise((r) => setTimeout(r, 1000));
}
await pool.end();
