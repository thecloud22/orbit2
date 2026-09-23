/**
 * Bringing a procedure in, asked for from the screen.
 *
 * The API does not do the work. Decision 2 puts the browser in the worker, so
 * this validates what was asked for and queues it, and the worker claims it
 * with the same lease a run uses — an authoring session whose worker dies is
 * found by the same sweep rather than sitting there looking busy.
 *
 * What is validated here is everything that can be known without opening a
 * page: that the application is registered and not retired, that a procedure
 * was actually written, that the inputs are named. What cannot be known until
 * the page is open — whether the procedure describes anything that is there —
 * is the walk's business, and comes back as questions against the draft.
 */
import { object, z } from '@orbit/contract';
import type { PoolClient } from 'pg';
import { pool } from './db.ts';

export const askedFor = object({
  name: z.string().trim().min(1, 'An agent needs a name.').max(160),
  /**
   * Kept verbatim, including the parts Orbit cannot use. §5 shows the author
   * what they wrote beside what was made of it, and a procedure tidied on the
   * way in makes that comparison meaningless.
   */
  procedure: z.string().trim().min(20, 'Say a little more — this is the whole description Orbit works from.').max(20_000),
  applicationId: z.uuid('Choose which application this runs against.'),
  startPath: z.string().trim().min(1).max(2048).default('/'),
  /** The example values the walk is done with, by input name. */
  inputs: z.record(z.string().min(1).max(120), z.string().max(2048)).default({}),
});
export type AskedFor = z.infer<typeof askedFor>;

export type Queued =
  | { ok: true; id: string }
  | { ok: false; because: string };

export async function bringIn(db: PoolClient, body: unknown): Promise<Queued> {
  const asked = askedFor.safeParse(body);
  if (!asked.success) {
    return { ok: false, because: asked.error.issues
      .map((i) => i.message || `${i.path.join('.')} is not right`).join(' ') };
  }
  const { name, procedure, applicationId, startPath, inputs } = asked.data;

  const { rows: [app] } = await db.query<{ name: string; retired_at: string | null; addresses: unknown }>(
    `SELECT a.name, a.retired_at, r.addresses
       FROM application a
       JOIN application_revision r ON r.application_id = a.id
      WHERE a.id = $1
      ORDER BY r.revision DESC LIMIT 1`, [applicationId]);

  if (!app) return { ok: false, because: 'There is no application registered with that reference.' };
  if (app.retired_at) {
    // Retirement is a status rather than a delete, so the application is still
    // here to be named — and naming it is not the same as being allowed to
    // point something new at it.
    return { ok: false, because: `${app.name} has been retired, so nothing new can be brought in against it.` };
  }

  const { rows: [session] } = await db.query<{ id: string }>(
    `INSERT INTO authoring_session (name, procedure, application_id, start_path, inputs)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [name, procedure, applicationId, startPath, JSON.stringify(inputs)]);

  await db.query(
    `INSERT INTO audit_entry (act, object_kind, object_id, changed)
     VALUES ('procedure brought in', 'authoring_session', $1, $2)`,
    [session!.id, JSON.stringify({ name, application: app.name })]);

  return { ok: true, id: session!.id };
}

/**
 * Where a session has got to.
 *
 * Polled by the screen while the walk runs. It carries the turns as they are
 * recorded rather than only at the end, because a walk takes a minute against
 * a real application and a person watching a spinner learns nothing — §5 asks
 * that Orbit show its working, and the working exists before the draft does.
 */
export async function readSession(id: string) {
  const { rows: [session] } = await pool.query(
    `SELECT s.id, s.name, s.status, s.workflow_id, s.refused, s.queued_at, s.ended_at, s.captured,
            a.name AS application
       FROM authoring_session s JOIN application a ON a.id = s.application_id
      WHERE s.id = $1`, [id]);
  if (!session) return null;

  const { rows: turns } = await pool.query(
    `SELECT turn, verdict, why, model, shown, screenshot FROM model_call
      WHERE workflow_id = $1 ORDER BY turn`, [session.workflow_id]);

  // While the walk is running there is no draft yet, so no model calls to read
  // — they are written in the transaction that stores the draft, because a
  // reading that does not hold together keeps none of itself. What the session
  // appended as it went is what the screen has to go on until then.
  const { captured, ...rest } = session as { captured?: unknown[] };
  return { session: rest, turns: turns.length > 0 ? turns : (captured ?? []) };
}

/**
 * Asking for a demonstration to be recorded.
 *
 * Less to validate than a written procedure, because there is no procedure to
 * validate — the demonstration is the description. What is checked is the same
 * as before: the application is registered and in service, and the agent has a
 * name to be found by.
 */
export const recordingAskedFor = object({
  name: z.string().trim().min(1, 'An agent needs a name.').max(160),
  applicationId: z.uuid('Choose which application this runs against.'),
  startPath: z.string().trim().min(1).max(2048).default('/'),
});

export async function startRecording(db: PoolClient, body: unknown): Promise<Queued> {
  const asked = recordingAskedFor.safeParse(body);
  if (!asked.success) {
    return { ok: false, because: asked.error.issues
      .map((i) => i.message || `${i.path.join('.')} is not right`).join(' ') };
  }
  const { name, applicationId, startPath } = asked.data;

  const { rows: [app] } = await db.query<{ name: string; retired_at: string | null }>(
    `SELECT name, retired_at FROM application WHERE id = $1`, [applicationId]);
  if (!app) return { ok: false, because: 'There is no application registered with that reference.' };
  if (app.retired_at) {
    return { ok: false, because: `${app.name} has been retired, so nothing new can be brought in against it.` };
  }

  const { rows: [session] } = await db.query<{ id: string }>(
    `INSERT INTO recording_session (name, application_id, start_path) VALUES ($1, $2, $3) RETURNING id`,
    [name, applicationId, startPath]);

  await db.query(
    `INSERT INTO audit_entry (act, object_kind, object_id, changed)
     VALUES ('procedure brought in', 'recording_session', $1, $2)`,
    [session!.id, JSON.stringify({ name, application: app.name, by: 'demonstration' })]);

  return { ok: true, id: session!.id };
}

/**
 * The person saying they are finished.
 *
 * Recorded rather than signalled, because the screen and the browser are held
 * by two processes and a signal between them would not survive either one
 * restarting. The worker sees the column and closes the browser.
 */
export async function finishRecording(db: PoolClient, id: string): Promise<Queued> {
  const { rows } = await db.query<{ status: string }>(
    `UPDATE recording_session SET finish_requested_at = now()
      WHERE id = $1 AND status IN ('queued', 'recording') AND finish_requested_at IS NULL
      RETURNING status`, [id]);
  if (rows.length === 0) {
    return { ok: false, because: 'That recording is not running, or you have already finished it.' };
  }
  return { ok: true, id };
}

export async function readRecording(id: string) {
  const { rows: [session] } = await pool.query(
    `SELECT s.id, s.name, s.status, s.captured, s.finish_requested_at,
            s.workflow_id, s.refused, s.queued_at, s.ended_at,
            a.name AS application
       FROM recording_session s JOIN application a ON a.id = s.application_id
      WHERE s.id = $1`, [id]);
  return session ?? null;
}

/** What may be brought in against, for a screen that has to offer a choice. */
export async function listApplications() {
  const { rows } = await pool.query(
    `SELECT DISTINCT ON (a.id)
            a.id, a.name, a.surface, a.owner_note, a.retired_at,
            r.revision, r.addresses, r.sign_in_as, r.credential_name
       FROM application a
       JOIN application_revision r ON r.application_id = a.id
      ORDER BY a.id, r.revision DESC`);
  // Retired ones are returned rather than filtered out: a screen that simply
  // omits them cannot explain why the application somebody is looking for is
  // missing.
  return { applications: rows };
}
