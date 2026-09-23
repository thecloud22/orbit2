/**
 * §10's run controls: cancel, retry, re-run.
 *
 * Three verbs that sound similar and are not. Cancel asks a run in flight to
 * stop. Retry re-attempts a failed step inside the run that failed. Re-run
 * starts a new run from the same inputs. The distinction that matters is
 * whether the result is the same run or another one, because a run is the unit
 * the record is kept in — merging two attempts into one run, or splitting one
 * attempt across two, both make the record say something that did not happen.
 *
 * Each returns a refusal with a reason rather than throwing, for the same
 * reason the editor does: "cannot be cancelled" is an answer, not a fault.
 */
import { isRetryable, type ErrorKind } from '@orbit/contract';
import type { PoolClient } from 'pg';

export type Control =
  | { ok: true; reference: string }
  | { ok: false; because: string };

interface RunRow {
  id: string;
  reference: string;
  status: string;
  version_id: string;
  inputs: Record<string, string>;
  error: { kind: ErrorKind; step?: number;
    partial?: { changed: Array<{ application: string | null; step: number; control: string }>;
                unknown?: { application: string | null; step: number; control: string } } } | null;
  cancel_requested_at: string | null;
  retries: number;
}

const load = async (db: PoolClient, reference: string): Promise<RunRow | null> => {
  const { rows } = await db.query<RunRow>(
    `SELECT id, reference, status, version_id, inputs, error, cancel_requested_at, retries
       FROM run WHERE reference = $1`, [reference]);
  return rows[0] ?? null;
};

const audit = (db: PoolClient, act: string, runId: string, changed: unknown) =>
  db.query(`INSERT INTO audit_entry (act, object_kind, object_id, changed) VALUES ($1, 'run', $2, $3)`,
    [act, runId, JSON.stringify(changed)]);

/** Whether a person has said they looked at what a part-way run left behind (C15). */
const checked = async (db: PoolClient, runId: string): Promise<boolean> => {
  const { rows: [c] } = await db.query(`SELECT 1 FROM run_event WHERE run_id = $1 AND kind = 'run.checked' LIMIT 1`, [runId]);
  return Boolean(c);
};

/** Said when a part-way run holds a retry or a re-run, in the terms of what each system holds. */
const heldBecause = (p: NonNullable<NonNullable<RunRow['error']>['partial']>): string => {
  const unknown = p.unknown
    ? `${p.unknown.control} was pressed on ${p.unknown.application ?? 'the application'} and never answered, so it may hold its effect. `
    : '';
  const changed = p.changed.length
    ? `${p.changed.map((c) => `${c.control} on ${c.application ?? 'the application'}`).join(' and ')} already went through. `
    : '';
  return `${unknown}${changed}Running it again before a person has looked could do it twice. Check, say so on the run page, then run it again.`;
};

/**
 * A person has looked at what a part-way run left behind, in each system, and
 * says so (Orbit 2.2, C15). Recorded as an event: the run itself is unchanged.
 */
export async function checkRun(db: PoolClient, reference: string): Promise<Control> {
  const run = await load(db, reference);
  if (!run) return { ok: false, because: 'There is no run with that reference.' };
  if (run.status !== 'failed' || !run.error?.partial) {
    return { ok: false, because: 'This run did not stop part-way, so there is nothing to check.' };
  }
  if (await checked(db, run.id)) return { ok: false, because: 'Somebody has already said this was checked.' };
  await db.query(`INSERT INTO run_event (run_id, kind, detail) VALUES ($1, 'run.checked', $2)`,
    [run.id, JSON.stringify({ unknown: run.error.partial.unknown ?? null, changed: run.error.partial.changed })]);
  await audit(db, 'run checked', run.id, { reference });
  return { ok: true, reference };
}

/**
 * Asks a queued or running run to stop.
 *
 * It does not stop anything. §10: cancellation "is cooperative: the run stops
 * at the next safe boundary rather than mid-action". So this records that
 * somebody asked, and the executor reads the request between steps and stops
 * there. The run is not marked cancelled here either — it is marked cancelled
 * when it actually stops, because a run whose status says cancelled while a
 * browser is still driving it is a record that disagrees with the world.
 *
 * A queued run has no executor to read the request, so it is stopped outright:
 * there is no action in flight to be part-way through.
 */
export async function cancelRun(db: PoolClient, reference: string): Promise<Control> {
  const run = await load(db, reference);
  if (!run) return { ok: false, because: 'There is no run with that reference.' };
  if (run.cancel_requested_at) return { ok: false, because: 'Cancelling it has already been asked for.' };
  if (run.status !== 'queued' && run.status !== 'running') {
    return { ok: false, because: `This run is ${run.status}, so there is nothing to stop.` };
  }

  if (run.status === 'queued') {
    // No error is recorded, and the database insists on that: a run carries an
    // error only when it failed. Being stopped on purpose is not a failure,
    // and filing it as one would put a technical fault on the record where a
    // person's decision belongs.
    await db.query(
      `UPDATE run SET status = 'cancelled', cancel_requested_at = now(), ended_at = now()
         WHERE id = $1`, [run.id]);
  } else {
    await db.query(`UPDATE run SET cancel_requested_at = now() WHERE id = $1`, [run.id]);
  }
  await audit(db, 'run cancelled', run.id, { reference, was: run.status });
  return { ok: true, reference };
}

/**
 * Re-attempts the step a run failed on, inside the same run.
 *
 * Only where the failure kind could plausibly come out differently — §9:
 * "failures that will not improve on repetition are not retried". The set is
 * declared in the contract with the reasoning, so this cannot quietly widen.
 *
 * The run returns to the queue rather than being executed here. Nothing about
 * retrying is special enough to deserve a second execution path, and a second
 * path is how the two drift.
 */
export async function retryRun(db: PoolClient, reference: string): Promise<Control> {
  const run = await load(db, reference);
  if (!run) return { ok: false, because: 'There is no run with that reference.' };
  if (run.status !== 'failed') {
    return { ok: false, because: `This run is ${run.status}, so there is no failed step to re-attempt.` };
  }
  if (!run.error) return { ok: false, because: 'This run failed without recording what kind of failure it was, so it cannot be retried.' };
  if (!isRetryable(run.error.kind)) {
    return { ok: false, because:
      `A ${run.error.kind} failure will not come out differently on a second attempt. Repair the workflow, or start a fresh run.` };
  }
  // A retry runs the version from the start, so it would press again what
  // already went through, and what may have (C15).
  const p = run.error.partial;
  if (p && (p.unknown || p.changed.length) && !(await checked(db, run.id))) return { ok: false, because: heldBecause(p) };

  await db.query(
    `UPDATE run SET status = 'queued', retries = retries + 1, error = NULL,
            ended_at = NULL, claimed_by = NULL, lease_expires_at = NULL WHERE id = $1`, [run.id]);
  await audit(db, 'run retried', run.id, { reference, after: run.error.kind, attempt: run.retries + 2 });
  return { ok: true, reference };
}

/**
 * Starts a fresh run with the same inputs, linked to the original.
 *
 * The link is the point. §10 asks for it explicitly, and without it a re-run
 * is indistinguishable from somebody happening to start the same work twice —
 * which matters when the question being asked of the record later is how many
 * times this actually happened.
 *
 * Unlike retry, this is allowed from any finished state, including a
 * successful one: re-running something that worked is a normal thing to want.
 * It is refused only while the original is still going, because "the same
 * inputs" is not yet a settled fact about a run still producing outputs.
 */
export async function rerun(db: PoolClient, reference: string): Promise<Control> {
  const run = await load(db, reference);
  if (!run) return { ok: false, because: 'There is no run with that reference.' };
  if (run.status === 'queued' || run.status === 'running') {
    return { ok: false, because: 'This run has not finished yet. Cancel it first, or wait for it.' };
  }
  if (run.error?.partial?.unknown && !(await checked(db, run.id))) return { ok: false, because: heldBecause(run.error.partial) };

  // The version is the one this run used, not whichever is live now. A re-run
  // that quietly picked up a newer version would not be a re-run of anything.
  const fresh = crypto.randomUUID().slice(0, 6).toUpperCase();
  await db.query(
    `INSERT INTO run (version_id, reference, status, inputs, rerun_of)
     VALUES ($1, $2, 'queued', $3, $4)`,
    [run.version_id, fresh, JSON.stringify(run.inputs), run.id]);
  await audit(db, 'run started', run.id, { reference: fresh, rerunOf: reference });
  return { ok: true, reference: fresh };
}

/**
 * A person has done what a waiting run asked, and says so (the Human in the
 * Loop step). What they hand back is checked against what the step declared
 * it would, and the run is queued to carry on from the step after the wait.
 */
export async function continueRun(db: PoolClient, reference: string, body: unknown): Promise<Control> {
  const given = (body as { handedBack?: unknown } | null)?.handedBack ?? {};
  if (typeof given !== 'object' || given === null || Array.isArray(given)) {
    return { ok: false, because: 'Say what the person handed back, by name.' };
  }
  const { rows: [run] } = await db.query<{ id: string; status: string; held: { resumeAt: number } | null; body: { steps: Array<Record<string, unknown>> } }>(
    `SELECT r.id, r.status, r.held, v.body FROM run r JOIN workflow_version v ON v.id = r.version_id
      WHERE r.reference = $1 FOR UPDATE OF r`, [reference]);
  if (!run) return { ok: false, because: 'There is no run with that reference.' };
  if (run.status !== 'waitingForAPerson' || !run.held) return { ok: false, because: 'This run is not waiting for anybody.' };

  const wait = run.body.steps[run.held.resumeAt - 2] as { kind?: string; handsBack?: Array<{ name: string; label: string; required: boolean }> } | undefined;
  const declared = wait?.kind === 'handOff' ? wait.handsBack ?? [] : [];
  const handedBack = given as Record<string, unknown>;
  const unknown = Object.keys(handedBack).filter((k) => !declared.some((d) => d.name === k));
  if (unknown.length) return { ok: false, because: `This step does not ask for ${unknown.join(', ')}.` };
  const missing = declared.filter((d) => d.required && !String(handedBack[d.name] ?? '').trim());
  if (missing.length) return { ok: false, because: `Still needed: ${missing.map((d) => d.label).join(', ')}.` };
  const values = Object.fromEntries(declared.flatMap((d) =>
    handedBack[d.name] === undefined ? [] : [[d.name, String(handedBack[d.name]).trim()]]));

  await db.query(
    `UPDATE run SET status = 'queued', held = held || $2::jsonb, lease_expires_at = NULL, claimed_by = NULL
      WHERE id = $1`, [run.id, JSON.stringify({ handedBack: values })]);
  await audit(db, 'waiting run answered', run.id, { handedBack: Object.keys(values) });
  return { ok: true, reference };
}
