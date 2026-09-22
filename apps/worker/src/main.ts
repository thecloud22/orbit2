/**
 * The worker: claims a queued run, executes it, records what happened.
 *
 * It claims with a lease rather than a flag, so a worker that dies is found by
 * a sweep rather than by a restart (Decision 2). Slice 1 runs one worker; the
 * lease is what makes a second a deployment change rather than a redesign.
 */
import { Pool } from 'pg';
import { step as stepSchema, type Step, originOf } from '@orbit/contract';
import { execute } from './execute.ts';
import { reconcile } from './reconcile.ts';
import { modelFromEnvironment } from '@orbit/model';
import { authorAndStore, storeDraft } from './author-store.ts';
import { sortAndStore, tabulateAndStore } from './sort-store.ts';
import { answerAndStore } from './chat-store.ts';
import { record } from './record.ts';
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

/**
 * A procedure waiting to be sorted (Orbit 2.1). No browser: the model is shown
 * numbered sentences and nothing else, so this could live anywhere — it lives
 * here so that every model call Orbit makes goes out from one place.
 */
async function claimSorting(): Promise<string | null> {
  const { rows } = await pool.query<{ workflow_id: string }>(
    `UPDATE understanding SET status = 'sorting',
            claimed_by = $1, lease_expires_at = now() + interval '10 minutes'
      WHERE workflow_id = (SELECT workflow_id FROM understanding
                   WHERE status = 'queued'
                     AND (lease_expires_at IS NULL OR lease_expires_at < now())
                   ORDER BY queued_at FOR UPDATE SKIP LOCKED LIMIT 1)
      RETURNING workflow_id`, [worker]);
  return rows[0]?.workflow_id ?? null;
}

async function sortOne(workflowId: string) {
  const db = await pool.connect();
  try {
    console.log(`  sorting the sentences of ${workflowId}`);
    const model = modelFromEnvironment();
    const result = await sortAndStore(db, workflowId, model);
    if (result.sorted) await tabulateAndStore(db, workflowId, model);
    if (result.sorted) {
      await db.query(`UPDATE understanding SET status = 'sorted', sorted_at = now() WHERE workflow_id = $1`,
        [workflowId]);
      console.log(`  sorted: ${result.labelled} sentences labelled`);
    } else {
      await db.query(`UPDATE understanding SET status = 'refused', refused = $2 WHERE workflow_id = $1`,
        [workflowId, JSON.stringify({ describe: result.describe })]);
      console.log(`  not sorted: ${result.describe}`);
    }
  } catch (error) {
    await db.query(`UPDATE understanding SET status = 'refused', refused = $2 WHERE workflow_id = $1`,
      [workflowId, JSON.stringify({ describe: `Orbit could not sort this: ${String(error)}` })]).catch(() => undefined);
    console.log(`  not sorted: ${String(error)}`);
  } finally {
    db.release();
  }
}

/** A chat message waiting for an answer (§12). Somebody is watching the screen for it. */
async function claimChat(): Promise<string | null> {
  const { rows } = await pool.query<{ id: string }>(
    `UPDATE chat_message SET claimed_by = $1, lease_expires_at = now() + interval '2 minutes'
      WHERE id = (SELECT id FROM chat_message
                   WHERE state = 'waiting' AND (lease_expires_at IS NULL OR lease_expires_at < now())
                   ORDER BY seq FOR UPDATE SKIP LOCKED LIMIT 1)
      RETURNING id`, [worker]);
  return rows[0]?.id ?? null;
}

async function chatOne(messageId: string) {
  const db = await pool.connect();
  try {
    console.log(`  chat: ${await answerAndStore(db, messageId, modelFromEnvironment())}`);
  } catch (error) {
    // Answered with a refusal rather than left waiting for a lease to lapse.
    await db.query(`UPDATE chat_message SET state = 'answered' WHERE id = $1 AND state = 'waiting'`, [messageId]).catch(() => undefined);
    await db.query(
      `INSERT INTO chat_message (workflow_id, said_by, text, state, outcome, answers)
       SELECT workflow_id, 'orbit', $2, 'refused', '{"refused":"failed"}', id FROM chat_message WHERE id = $1`,
      [messageId, 'Orbit could not answer that just now. Nothing was changed.']).catch(() => undefined);
    console.log(`  chat failed: ${String(error)}`);
  } finally {
    db.release();
  }
}

async function authorOne(sessionId: string) {
  const db = await pool.connect();
  try {
    const { rows: [s] } = await db.query<{
      name: string; procedure: string; application_id: string; start_path: string;
      inputs: Record<string, string>; host: string; into_workflow_id: string | null;
    }>(`SELECT s.name, s.procedure, s.application_id, s.start_path, s.inputs, s.into_workflow_id,
               (r.addresses->0->>'host') AS host, (r.addresses->0->>'scheme') AS scheme
          FROM authoring_session s
          JOIN application_revision r ON r.application_id = s.application_id
         WHERE s.id = $1
         ORDER BY r.revision DESC LIMIT 1`, [sessionId]);
    if (!s) return;

    console.log(`  bringing in "${s.name}" against http://${s.host}`);
    // One write at a time, in the order the turns happened — the same
    // arrangement the recorder uses, and for the same reason: these fire from
    // a callback, and two that arrived together could otherwise land either
    // way round.
    let appending: Promise<unknown> = Promise.resolve();

    const result = await authorAndStore(db, {
      name: s.name,
      procedure: s.procedure,
      applicationId: s.application_id,
      origin: originOf(s),
      startPath: s.start_path,
      inputs: s.inputs,
      ...(s.into_workflow_id ? { into: s.into_workflow_id } : {}),
      model: modelFromEnvironment(),
      onTurn: (t) => {
        console.log(`  turn ${t.turn} ${t.verdict}: ${t.why}`);
        appending = appending.then(() => pool.query(
          `UPDATE authoring_session SET captured = captured || $2::jsonb WHERE id = $1`,
          [sessionId, JSON.stringify([{ turn: t.turn, verdict: t.verdict, why: t.why }])]));
      },
    });

    // Every append landed before the session is finished with.
    await appending;

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

/**
 * A recording, claimed and driven by the person rather than by a model.
 *
 * The worker opens the browser and gets out of the way. Two things make this
 * different from an authoring session: the steps are written back as they are
 * captured, so the person watches their own actions arrive as steps rather
 * than demonstrating a procedure on faith; and it ends when they say so, which
 * arrives as a column because the screen and the browser are held by different
 * processes.
 *
 * The lease is long. A person doing a job by hand takes as long as the job
 * takes, and a sweep that reclaimed the session underneath them would close
 * the browser mid-demonstration.
 */
async function claimRecording(): Promise<string | null> {
  const { rows } = await pool.query<{ id: string }>(
    `UPDATE recording_session SET status = 'recording',
            claimed_by = $1, lease_expires_at = now() + interval '2 hours'
      WHERE id = (SELECT id FROM recording_session
                   WHERE status = 'queued'
                     AND (lease_expires_at IS NULL OR lease_expires_at < now())
                   ORDER BY queued_at FOR UPDATE SKIP LOCKED LIMIT 1)
      RETURNING id`, [worker]);
  return rows[0]?.id ?? null;
}

async function recordOne(sessionId: string) {
  const db = await pool.connect();
  try {
    const { rows: [s] } = await db.query<{ name: string; start_path: string; host: string;
      credential_name: string | null; sign_in_as: string | null }>(
      `SELECT s.name, s.start_path, (r.addresses->0->>'host') AS host, (r.addresses->0->>'scheme') AS scheme, r.credential_name, r.sign_in_as
         FROM recording_session s
         JOIN application_revision r ON r.application_id = s.application_id
        WHERE s.id = $1 ORDER BY r.revision DESC LIMIT 1`, [sessionId]);
    if (!s) return;

    console.log(`  recording "${s.name}" against http://${s.host} — waiting for you to finish`);

    // One write at a time, in the order things happened. These fire from
    // callbacks and were each their own unawaited query, so two that arrived
    // together could land either way round — and a procedure whose steps are
    // out of order is not the procedure that was demonstrated.
    let appending: Promise<unknown> = Promise.resolve();
    const append = (row: unknown) => {
      appending = appending.then(() => pool.query(
        `UPDATE recording_session SET captured = captured || $2::jsonb WHERE id = $1`,
        [sessionId, JSON.stringify([row])]));
    };

    // The person's own signal, read from the store. Polled rather than pushed
    // for the same reason it is a column: two processes, either of which may
    // restart, and a demonstration that could not be stopped afterwards would
    // leave a browser open with nobody watching it.
    const finished = new Promise<void>((resolve) => {
      const timer = setInterval(async () => {
        const { rows } = await pool.query<{ at: string | null }>(
          `SELECT finish_requested_at AS at FROM recording_session WHERE id = $1`, [sessionId]);
        if (rows[0]?.at) { clearInterval(timer); resolve(); }
      }, 1000);
    });

    const recording = await record({
      origin: originOf(s),
      startPath: s.start_path,
      credentialName: s.credential_name,
      signsInAs: s.sign_in_as,
      until: finished,
      onStep: (step, on) => {
        console.log(`  captured: ${step.kind.padEnd(9)} ${step.summary}`);
        // Written as it happens, and written whole. A recorder that shows
        // nothing until the end asks somebody to demonstrate a procedure and
        // trust that it watched; one that shows only what they did tells them
        // something they already know. What they cannot see from the browser
        // is how Orbit will find that control again, which is the thing that
        // fails at run time and the thing they can still fix while standing
        // in front of the page.
        const target = (step as unknown as Record<string, { label?: string; binding?: unknown }>);
        const named = target['into'] ?? target['control'] ?? target['region'] ?? null;
        append({
          kind: step.kind, summary: step.summary, on,
          label: named?.label ?? null, binding: named?.binding ?? null,
        });
      },
      onNote: (note) => {
        console.log(`  · ${note.body}`);
        append({ kind: 'note', noteKind: note.kind, summary: note.body });
      },
    });

    // Every append landed before the draft is built from them.
    await appending;

    const result = await storeDraft(db, { name: s.name, procedure: null }, {
      steps: recording.steps,
      questions: recording.questions,
      turns: [],          // nothing was asked of a model: the person showed it
      declaredInputs: declaredFrom(recording.steps),
    });

    if (result.stored === false) {
      await db.query(
        `UPDATE recording_session SET status = 'refused', refused = $2, ended_at = now() WHERE id = $1`,
        [sessionId, JSON.stringify({ describe: result.describe, problems: result.problems })]);
      console.log(`  refused: ${result.describe}`);
      return;
    }

    await db.query(
      `UPDATE recording_session SET status = 'brought in', workflow_id = $2, ended_at = now() WHERE id = $1`,
      [sessionId, result.workflowId]);
    console.log(`  brought in: ${recording.steps.length} steps from ${recording.touched} actions`);
  } catch (error) {
    await db.query(
      `UPDATE recording_session SET status = 'refused', refused = $2, ended_at = now() WHERE id = $1`,
      [sessionId, JSON.stringify({ describe: `The recording could not be kept: ${String(error)}` })]);
    console.log(`  refused: ${String(error)}`);
  } finally {
    db.release();
  }
}

/** The inputs a recording implies: one per value a step was given. */
function declaredFrom(steps: Step[]) {
  return [...new Set(steps.flatMap((s) =>
    (s.kind === 'enter' && s.value.from === 'input' ? [s.value.value] : [])))]
    .map((name) => ({ name, label: name, type: 'text' as const, required: true as const }));
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
    const origin = originOf(app.addresses[0]);

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

    const { halted, values, reached, handedOff } = await execute(
      db, runId, steps, row.inputs, await open(origin), app.sign_in_as ?? null);

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
    if (handedOff) {
      // Stopped at the edge of its authority, as the version says to. A
      // success with no conclusion of its own: a person takes it from here.
      await db.query(
        `UPDATE run SET status = 'handedToAPerson', outputs = $2, ended_at = now() WHERE id = $1`,
        [runId, JSON.stringify(Object.fromEntries(values))]);
      await db.query(`INSERT INTO run_event (run_id, kind, detail) VALUES ($1, 'run.succeeded', $2)`,
        [runId, JSON.stringify({ handedToAPerson: handedOff.request })]);
      console.log(`  ${row.reference}: handed to a person — ${handedOff.request}`);
      return;
    }

    const outcome = reached;
    const outputs = Object.fromEntries(values);
    await db.query(
      `UPDATE run SET status = 'succeeded', outcome = $2, outputs = $3, ended_at = now() WHERE id = $1`,
      [runId, outcome, JSON.stringify(outputs)]);
    await db.query(`INSERT INTO run_event (run_id, kind, detail) VALUES ($1, 'run.succeeded', $2)`,
      [runId, JSON.stringify({ outcome })]);
    console.log(`  ${row.reference}: succeeded — ${outcome}`);
  } catch (error) {
    // A driver that throws ends the run, not the worker.
    //
    // `execute` halts with a typed error for everything it decides — a control
    // it cannot find, a comparison it cannot carry out — but the driver
    // underneath it can throw on its own account, and nothing caught that. A
    // single slow page took the whole process down mid-suite:
    //
    //   page.goto: Timeout 30000ms exceeded.
    //     at BrowserSurface.open (surface-browser.ts:31)
    //   Node.js v26.8.1
    //
    // The run it was doing was left `running` with no error on it, every
    // queued run and authoring session behind it stopped, and the only sign
    // was a process that was no longer there. `authorOne` and `recordOne` have
    // caught this since they were written; the run path never did.
    //
    // `timedOut` has been in the error vocabulary from the start with nothing
    // producing it. This is what it is for.
    const why = String(error);
    const halt = {
      kind: /Timeout|timed out/i.test(why) ? 'timedOut' : 'applicationUnavailable',
      step: 0,
      describe: `The application did not answer: ${why.split('\n')[0]}`,
    };
    await db.query(`UPDATE run SET status = 'failed', error = $2, ended_at = now() WHERE id = $1`,
      [runId, JSON.stringify(halt)]).catch(() => undefined);
    await db.query(`INSERT INTO run_event (run_id, kind, detail) VALUES ($1, 'run.failed', $2)`,
      [runId, JSON.stringify(halt)]).catch(() => undefined);
    console.log(`  run ${runId}: failed — ${halt.describe}`);
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

  const chatId = await claimChat();
  if (chatId) { await chatOne(chatId); if (once) break; continue; }

  const sortingId = await claimSorting();
  if (sortingId) { await sortOne(sortingId); if (once) break; continue; }

  const sessionId = await claimAuthoring();
  if (sessionId) { await authorOne(sessionId); if (once) break; continue; }

  const recordingId = await claimRecording();
  if (recordingId) { await recordOne(recordingId); if (once) break; continue; }

  if (once) break;
  await new Promise((r) => setTimeout(r, 1000));
}
await pool.end();
