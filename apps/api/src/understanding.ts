/**
 * Understanding a procedure before anything is drafted from it (Orbit 2.1).
 *
 * Bringing a procedure in makes the draft at once, with its text held as
 * numbered sentences, and queues it for sorting. A worker labels every
 * sentence; a person reads the labels, changes any that are wrong, and
 * confirms. Only the confirmation starts the walk, and the walk is given the
 * sentences Orbit is to do — never the background, the work for a person, or
 * what the procedure says not to do.
 *
 * What the model contributes is one label per numbered sentence. It cannot
 * add, drop or reword one; the check that enforces that is in the contract,
 * and a sort that fails it is kept as a refusal, not as half an answer.
 */
import { object, sentenceLabel, sentenceNumber, z, type SentenceLabel } from '@orbit/contract';
import type { ClientBase, PoolClient } from 'pg';
import { askedFor, type Queued } from './authoring.ts';
import { insertPart, PART_LIMIT, readCoverage } from './procedure.ts';
import { pool } from './db.ts';

/** The same request as a walk, with room for a long procedure. */
export const understandingAskedFor = askedFor.extend({
  procedure: z.string().min(20, 'Say a little more — this is the whole description Orbit works from.')
    .max(PART_LIMIT, `A procedure pasted in one go can be at most ${PART_LIMIT.toLocaleString('en-US')} characters.`),
});

export async function bringInToUnderstand(db: PoolClient, body: unknown): Promise<Queued> {
  const asked = understandingAskedFor.safeParse(body);
  if (!asked.success) {
    return { ok: false, because: asked.error.issues
      .map((i) => i.message || `${i.path.join('.')} is not right`).join(' ') };
  }
  const { name, procedure, applicationId, startPath, inputs } = asked.data;

  const { rows: [app] } = await db.query<{ name: string; retired_at: string | null }>(
    `SELECT name, retired_at FROM application WHERE id = $1`, [applicationId]);
  if (!app) return { ok: false, because: 'There is no application registered with that reference.' };
  if (app.retired_at) {
    return { ok: false, because: `${app.name} has been retired, so nothing new can be brought in against it.` };
  }

  await db.query('BEGIN');
  try {
    // The procedure column keeps the text whole, as the author wrote it; the
    // parts below hold the same words split. Two views of one text, and the
    // draft screen already reads the first.
    const { rows: [workflow] } = await db.query<{ id: string }>(
      `INSERT INTO workflow (name, procedure) VALUES ($1, $2) RETURNING id`, [name, procedure]);
    const workflowId = workflow!.id;
    await db.query(
      `INSERT INTO understanding (workflow_id, application_id, start_path, inputs) VALUES ($1, $2, $3, $4)`,
      [workflowId, applicationId, startPath, JSON.stringify(inputs)]);
    const part = await insertPart(db, workflowId, { source: 'pasted', body: procedure });
    if (!part.ok) {
      await db.query('ROLLBACK');
      return { ok: false, because: part.because };
    }
    await db.query(
      `INSERT INTO audit_entry (act, object_kind, object_id, changed)
       VALUES ('procedure brought in to be understood', 'workflow', $1, $2)`,
      [workflowId, JSON.stringify({ name, application: app.name, sentences: part.sentences.length })]);
    await db.query('COMMIT');
    return { ok: true, id: workflowId };
  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  }
}

export type SentenceView = {
  number: string; part: string; n: number; text: string; kind: string;
  label: SentenceLabel | null; reason: string | null; basis: string | null; givenBy: string | null;
};

async function sentencesWithLabels(db: ClientBase, workflowId: string): Promise<SentenceView[]> {
  const { rows } = await db.query<SentenceView>(
    `SELECT p.key || '.' || s.n AS number, p.key AS part, s.n, s.text, s.kind,
            l.label, l.reason, l.basis, l.given_by AS "givenBy"
       FROM procedure_sentence s
       JOIN procedure_part p ON p.id = s.part_id
       LEFT JOIN LATERAL (
         SELECT label, reason, basis, given_by FROM sentence_label
          WHERE sentence_id = s.id ORDER BY seq DESC LIMIT 1) l ON true
      WHERE p.workflow_id = $1
      ORDER BY p.added_at, p.key, s.n`, [workflowId]);
  return rows;
}

/** Where a draft's understanding stands, every sentence with its label, and the count. */
export async function readUnderstanding(workflowId: string) {
  const db = await pool.connect();
  try { return await understandingOf(db, workflowId); } finally { db.release(); }
}

export async function understandingOf(db: ClientBase, workflowId: string) {
  const { rows: [u] } = await db.query<{
    status: 'queued' | 'sorting' | 'sorted' | 'refused'; refused: { describe: string } | null;
    queued_at: string; sorted_at: string | null; confirmed_at: string | null; session_id: string | null;
    name: string; application: string; walk: string | null;
  }>(
    `SELECT u.status, u.refused, u.queued_at, u.sorted_at, u.confirmed_at, u.session_id,
            w.name, a.name AS application, s.status AS walk
       FROM understanding u
       JOIN workflow w ON w.id = u.workflow_id
       JOIN application a ON a.id = u.application_id
       LEFT JOIN authoring_session s ON s.id = u.session_id
      WHERE u.workflow_id = $1`, [workflowId]);
  if (!u) return null;
  return {
    ...u,
    sentences: await sentencesWithLabels(db, workflowId),
    coverage: await readCoverage(db, workflowId),
  };
}

export const relabelAskedFor = object({
  sentence: sentenceNumber,
  label: sentenceLabel,
  reason: z.string().trim().max(500).optional(),
});

export type Done = { ok: true } | { ok: false; because: string };

/**
 * A person says what a sentence is for. A new row, never an edit: the model's
 * label and the correction both stay on the record, and the latest counts.
 */
export async function relabel(db: ClientBase, workflowId: string, body: unknown): Promise<Done> {
  const asked = relabelAskedFor.safeParse(body);
  if (!asked.success) return { ok: false, because: 'Say which sentence, and which of the five it is.' };
  const { sentence, label, reason } = asked.data;

  const { rows: [u] } = await db.query<{ status: string; confirmed_at: string | null }>(
    `SELECT status, confirmed_at FROM understanding WHERE workflow_id = $1`, [workflowId]);
  if (!u) return { ok: false, because: 'This draft was not brought in to be understood.' };
  if (u.confirmed_at) {
    return { ok: false, because: 'The sort has been confirmed and drafted from. Relabelling now would change '
      + 'what the steps were drafted from without changing the steps.' };
  }
  if (u.status !== 'sorted') return { ok: false, because: 'Orbit has not finished sorting this yet.' };

  const [part, n] = sentence.split('.') as [string, string];
  const { rows: [found] } = await db.query<{ id: string }>(
    `SELECT s.id FROM procedure_sentence s JOIN procedure_part p ON p.id = s.part_id
      WHERE p.workflow_id = $1 AND p.key = $2 AND s.n = $3`, [workflowId, part, Number(n)]);
  if (!found) return { ok: false, because: `This procedure has no sentence ${sentence}.` };

  await db.query(
    `INSERT INTO sentence_label (sentence_id, label, reason, basis, given_by)
     VALUES ($1, $2, $3, 'stated', 'author')`,
    [found.id, label, reason?.trim() || 'Changed by the author.']);
  await db.query(
    `INSERT INTO audit_entry (act, object_kind, object_id, changed)
     VALUES ('sentence relabelled', 'workflow', $1, $2)`,
    [workflowId, JSON.stringify({ sentence, label })]);
  return { ok: true };
}

/** What the walk is given: the sentences Orbit is to do, in the author's order and words. */
export function forTheWalk(sentences: readonly SentenceView[]): string {
  return sentences.filter((s) => s.label === 'task' || s.label === 'rule').map((s) => s.text).join('\n');
}

/**
 * A person confirms the sort, and the walk is queued.
 *
 * Refused while any sentence is unplaced, or when nothing is left for Orbit to
 * do. What the walk is not given is written onto the draft as settled notes,
 * so the draft says what it deliberately leaves out rather than going quiet
 * about it.
 */
export async function confirmUnderstanding(db: PoolClient, workflowId: string): Promise<Queued> {
  await db.query('BEGIN');
  try {
    const { rows: [u] } = await db.query<{
      status: string; confirmed_at: string | null; application_id: string; start_path: string;
      inputs: Record<string, string>; name: string;
    }>(`SELECT u.status, u.confirmed_at, u.application_id, u.start_path, u.inputs, w.name
          FROM understanding u JOIN workflow w ON w.id = u.workflow_id
         WHERE u.workflow_id = $1 FOR UPDATE OF u`, [workflowId]);
    const refuse = async (because: string): Promise<Queued> => {
      await db.query('ROLLBACK');
      return { ok: false, because };
    };
    if (!u) return refuse('This draft was not brought in to be understood.');
    if (u.confirmed_at) return refuse('This has already been confirmed.');
    if (u.status !== 'sorted') return refuse('Orbit has not finished sorting this yet.');

    const sentences = await sentencesWithLabels(db, workflowId);
    const unplaced = sentences.filter((s) => !s.label).map((s) => s.number);
    if (unplaced.length) {
      return refuse(`${unplaced.length === 1 ? 'Sentence' : 'Sentences'} ${unplaced.join(', ')} `
        + `${unplaced.length === 1 ? 'has' : 'have'} no label yet. Every sentence is placed before anything is drafted.`);
    }
    const procedure = forTheWalk(sentences);
    if (!procedure) {
      return refuse('Nothing here is sorted as a task or a rule, so there is nothing for Orbit to do. '
        + 'If that is wrong, relabel the sentences Orbit should carry out.');
    }

    const { rows: [session] } = await db.query<{ id: string }>(
      `INSERT INTO authoring_session (name, procedure, application_id, start_path, inputs, into_workflow_id)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [u.name, procedure, u.application_id, u.start_path, JSON.stringify(u.inputs), workflowId]);

    // Settled when written: these are decisions the author just confirmed, not
    // questions left open, and they block nothing.
    for (const s of sentences.filter((x) => x.label === 'forAPerson' || x.label === 'wontDo')) {
      await db.query(
        `INSERT INTO workflow_note (workflow_id, kind, body, answer, resolved_at)
         VALUES ($1, 'assumption', $2, $3, now())`,
        [workflowId, `Sentence ${s.number}: "${s.text}"`,
         s.label === 'forAPerson'
           ? 'Left to a person. Orbit does not do this.'
           : 'Orbit will not do this, as the procedure says.']);
    }

    await db.query(
      `UPDATE understanding SET confirmed_at = now(), session_id = $2 WHERE workflow_id = $1`,
      [workflowId, session!.id]);
    await db.query(
      `INSERT INTO audit_entry (act, object_kind, object_id, changed)
       VALUES ('understanding confirmed', 'workflow', $1, $2)`,
      [workflowId, JSON.stringify({
        sentences: sentences.length,
        forTheWalk: sentences.filter((s) => s.label === 'task' || s.label === 'rule').length,
      })]);
    await db.query('COMMIT');
    return { ok: true, id: session!.id };
  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  }
}
