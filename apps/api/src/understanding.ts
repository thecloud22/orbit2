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
import { looksLikeInstructions, object, sentenceLabel, sentenceNumber, unreadAdvice, unreadColumns, z, type RuleTable, type SentenceLabel } from '@orbit/contract';
import type { ClientBase, PoolClient } from 'pg';
import { askedFor, type Queued } from './authoring.ts';
import { readPdf } from '@orbit/procedure';
import { inDocumentOrder, insertPart, PART_LIMIT, readCoverage } from './procedure.ts';
import { chatOf } from './chat.ts';
import { pool } from './db.ts';

/** A PDF as it travels in a request. 20 MB of file, base64-encoded. */
const PDF_LIMIT = Math.ceil((20 * 1024 * 1024 * 4) / 3);
const pdfBase64 = z.string().max(PDF_LIMIT, 'A PDF can be at most 20 MB.').regex(/^[A-Za-z0-9+/=\s]+$/, 'That is not a file.');

/**
 * Where the text came from: pasted, or read from a PDF. Read here rather than
 * by the screen, so the words that are split and numbered are the ones Orbit
 * read, and the screen is never the thing that decided what the document said.
 */
async function textOf(asked: { procedure?: string | undefined; pdf?: string | undefined }):
  Promise<{ ok: true; source: 'pasted' | 'pdf'; body: string; pages?: Array<{ page: number; start: number; end: number }> }
    | { ok: false; because: string }> {
  if (asked.pdf) {
    const read = await readPdf(new Uint8Array(Buffer.from(asked.pdf, 'base64')));
    if (!read.ok) return read;
    if (read.text.length > PART_LIMIT) {
      return { ok: false, because: `This PDF has more text than one part can hold (${PART_LIMIT.toLocaleString('en-US')} characters). Split it, and add the rest as the next part.` };
    }
    return { ok: true, source: 'pdf', body: read.text, pages: read.pages };
  }
  return { ok: true, source: 'pasted', body: asked.procedure ?? '' };
}

/** The same request as a walk, with room for a long procedure, or a PDF in its place. */
export const understandingAskedFor = askedFor.extend({
  procedure: z.string().min(20, 'Say a little more — this is the whole description Orbit works from.')
    .max(PART_LIMIT, `A procedure pasted in one go can be at most ${PART_LIMIT.toLocaleString('en-US')} characters.`)
    .optional(),
  pdf: pdfBase64.optional(),
  /** The author says this is not all of it, and will add the rest as parts (§13). */
  moreToCome: z.boolean().default(false),
  /** Start from a blank page and write it in the editor (R22). */
  blank: z.boolean().default(false),
});

export async function bringInToUnderstand(db: PoolClient, body: unknown): Promise<Queued> {
  const asked = understandingAskedFor.safeParse(body);
  if (!asked.success) {
    return { ok: false, because: asked.error.issues
      .map((i) => i.message || `${i.path.join('.')} is not right`).join(' ') };
  }
  const { name, applicationId, startPath, inputs, moreToCome, blank } = asked.data;
  if (!blank && Boolean(asked.data.procedure) === Boolean(asked.data.pdf)) {
    return { ok: false, because: 'Paste the procedure or upload it as a PDF — one of the two.' };
  }
  const read = blank ? { ok: true as const, source: 'pasted' as const, body: '' } : await textOf(asked.data);
  if (!read.ok) return read;
  const procedure = read.body;

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
    // A blank page has nothing to sort yet: it is sorted as it stands, and
    // each sentence the author writes is sorted as it arrives (R22).
    await db.query(
      `INSERT INTO understanding (workflow_id, application_id, start_path, inputs, more_to_come, status, sorted_at)
       VALUES ($1, $2, $3, $4, $5, $6, CASE WHEN $6 = 'sorted' THEN now() END)`,
      [workflowId, applicationId, startPath, JSON.stringify(inputs), moreToCome, blank ? 'sorted' : 'queued']);
    const part = blank ? { ok: true as const, sentences: [] as string[] }
      : await insertPart(db, workflowId, { source: read.source, body: procedure }, 'pages' in read ? read.pages : undefined);
    if (!part.ok) {
      await db.query('ROLLBACK');
      return { ok: false, because: part.because };
    }
    await db.query(
      `INSERT INTO audit_entry (act, object_kind, object_id, changed)
       VALUES ('procedure brought in to be understood', 'workflow', $1, $2)`,
      [workflowId, JSON.stringify({ name, application: app.name, sentences: part.sentences.length, blank })]);
    await db.query('COMMIT');
    return { ok: true, id: workflowId };
  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  }
}

export type SentenceView = {
  number: string; part: string; n: number; text: string; kind: string; unterminated: boolean; page: number | null;
  label: SentenceLabel | null; reason: string | null; basis: string | null; givenBy: string | null;
  /** Marked by the author: the run waits here for this person (Human in the Loop). */
  waits: boolean;
  /** Why this sentence reads like instructions to a machine, if it does. */
  suspicious?: string | null;
  /** What it arrived as, once the author has changed it (Decision 17). */
  was?: string | null;
  withdrawn?: boolean;
  revisedAt?: string | null;
  /** Whether the label was given to the words as they now stand. */
  labelCurrent?: boolean;
};

export async function sentencesWithLabels(db: ClientBase, workflowId: string): Promise<SentenceView[]> {
  // As each sentence now reads (Decision 17): its latest revision, or as it
  // arrived, with what it arrived as once it has changed.
  const { rows } = await db.query<SentenceView & { after: string | null }>(
    `SELECT p.key || '.' || s.n AS number, p.key AS part, s.n, s.text, s.kind, s.unterminated, s.page,
            l.label, l.reason, l.basis, l.given_by AS "givenBy", coalesce(l.waits, false) AS waits,
            s.arrived_as AS was, s.withdrawn, s.revised_at AS "revisedAt",
            (SELECT p2.key || '.' || s2.n FROM procedure_sentence s2 JOIN procedure_part p2 ON p2.id = s2.part_id
              WHERE s2.id = p.after_sentence_id) AS after,
            -- A label from before the sentence last changed describes words it no longer has.
            (l.created_at IS NOT NULL AND (s.revised_at IS NULL OR l.created_at > s.revised_at)) AS "labelCurrent"
       FROM sentence_now s
       JOIN procedure_part p ON p.id = s.part_id
       LEFT JOIN LATERAL (
         SELECT label, reason, basis, given_by, waits, created_at FROM sentence_label
          WHERE sentence_id = s.id ORDER BY seq DESC LIMIT 1) l ON true
      WHERE p.workflow_id = $1
      ORDER BY p.added_at, p.key, s.n`, [workflowId]);
  // Flagged, never altered: the words stay the author's, and a person decides.
  return inDocumentOrder(rows).map(({ after: _, ...r }) => ({ ...r, suspicious: looksLikeInstructions(r.text) }));
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
    name: string; application: string; walk: string | null; more_to_come: boolean;
  }>(
    `SELECT u.status, u.refused, u.queued_at, u.sorted_at, u.confirmed_at, u.session_id, u.more_to_come,
            w.name, a.name AS application, s.status AS walk
       FROM understanding u
       JOIN workflow w ON w.id = u.workflow_id
       JOIN application a ON a.id = u.application_id
       LEFT JOIN authoring_session s ON s.id = u.session_id
      WHERE u.workflow_id = $1`, [workflowId]);
  if (!u) return null;
  const { rows: parts } = await db.query<{ key: string; source: string; added_at: string; sentences: number }>(
    `SELECT p.key, p.source, p.added_at, count(s.id)::int AS sentences
       FROM procedure_part p LEFT JOIN procedure_sentence s ON s.part_id = p.id
      WHERE p.workflow_id = $1 GROUP BY p.id ORDER BY p.added_at, p.key`, [workflowId]);
  const { rows: [tables] } = await db.query<{ tables: RuleTable[] | null; refused: string | null }>(
    `SELECT tables, refused FROM rule_tables WHERE workflow_id = $1 ORDER BY seq DESC LIMIT 1`, [workflowId]);
  return {
    ...u,
    parts,
    rules: tables ?? null,
    chat: await chatOf(db, workflowId),
    sentences: await sentencesWithLabels(db, workflowId),
    coverage: await readCoverage(db, workflowId),
  };
}

export const relabelAskedFor = object({
  sentence: sentenceNumber,
  label: sentenceLabel,
  reason: z.string().trim().max(500).optional(),
  /** Only with forAPerson: the run stops here until the person has done it. */
  waits: z.boolean().optional(),
});

export type Done = { ok: true } | { ok: false; because: string };

/**
 * A person says what a sentence is for. A new row, never an edit: the model's
 * label and the correction both stay on the record, and the latest counts.
 */
export async function relabel(db: ClientBase, workflowId: string, body: unknown): Promise<Done> {
  const asked = relabelAskedFor.safeParse(body);
  if (!asked.success) return { ok: false, because: 'Say which sentence, and which of the five it is.' };
  const { sentence, label, reason, waits } = asked.data;
  if (waits && label !== 'forAPerson') return { ok: false, because: 'Only a sentence for a person can be where the run waits.' };

  const { rows: [u] } = await db.query<{ status: string; confirmed_at: string | null }>(
    `SELECT status, confirmed_at FROM understanding WHERE workflow_id = $1`, [workflowId]);
  if (!u) return { ok: false, because: 'This draft was not brought in to be understood.' };
  // After drafting a relabel is a change like any other (Decision 17): the
  // sentence waits to be mapped again, and a confirmation lapses.
  if (u.status !== 'sorted') return { ok: false, because: 'Orbit has not finished sorting this yet.' };
  if (u.confirmed_at) {
    await db.query(`UPDATE workflow SET confirmed_at = NULL, updated_at = now() WHERE id = $1`, [workflowId]);
  }

  const [part, n] = sentence.split('.') as [string, string];
  const { rows: [found] } = await db.query<{ id: string }>(
    `SELECT s.id FROM procedure_sentence s JOIN procedure_part p ON p.id = s.part_id
      WHERE p.workflow_id = $1 AND p.key = $2 AND s.n = $3`, [workflowId, part, Number(n)]);
  if (!found) return { ok: false, because: `This procedure has no sentence ${sentence}.` };

  await db.query(
    `INSERT INTO sentence_label (sentence_id, label, reason, basis, given_by, waits)
     VALUES ($1, $2, $3, 'stated', 'author', $4)`,
    [found.id, label, reason?.trim() || (waits ? 'The run waits here for this person.' : 'Changed by the author.'), Boolean(waits)]);
  await db.query(
    `INSERT INTO audit_entry (act, object_kind, object_id, changed)
     VALUES ('sentence relabelled', 'workflow', $1, $2)`,
    [workflowId, JSON.stringify({ sentence, label, ...(waits ? { waits } : {}) })]);
  // The rules as tables are made from the labels, so a relabel sends the
  // draft back to the worker to make them again. Nothing is re-sorted: every
  // sentence already has a label.
  await db.query(
    `UPDATE understanding SET status = 'queued', sorted_at = NULL, lease_expires_at = NULL, claimed_by = NULL
      WHERE workflow_id = $1`, [workflowId]);
  return { ok: true };
}

/**
 * What the walk is given: the sentences Orbit is to do, and the ones where the
 * run waits for a person, in the author's order and words.
 */
export function forTheWalk(sentences: readonly SentenceView[]): string {
  return sentences.filter(forOrbitOrAWait).map((s) => s.text).join('\n');
}
// Never a sentence that reads like instructions to a machine, whatever it was
// labelled: the walk could otherwise cite it as the line that asked for a press.
const forOrbitOrAWait = (s: SentenceView) => !s.suspicious && !s.withdrawn
  && (s.label === 'task' || s.label === 'rule' || (s.label === 'forAPerson' && s.waits));

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
      inputs: Record<string, string>; name: string; more_to_come: boolean;
    }>(`SELECT u.status, u.confirmed_at, u.application_id, u.start_path, u.inputs, u.more_to_come, w.name
          FROM understanding u JOIN workflow w ON w.id = u.workflow_id
         WHERE u.workflow_id = $1 FOR UPDATE OF u`, [workflowId]);
    const refuse = async (because: string): Promise<Queued> => {
      await db.query('ROLLBACK');
      return { ok: false, because };
    };
    if (!u) return refuse('This draft was not brought in to be understood.');
    if (u.confirmed_at) return refuse('This has already been confirmed.');
    if (u.status !== 'sorted') return refuse('Orbit has not finished sorting this yet.');
    if (u.more_to_come) {
      return refuse('You said more of the procedure is to come. Add the next part, or say that is all of it. '
        + 'Orbit works through the whole procedure once, so it waits for all of it.');
    }

    const sentences = await sentencesWithLabels(db, workflowId);
    const unplaced = sentences.filter((s) => !s.label).map((s) => s.number);
    if (unplaced.length) {
      return refuse(`${unplaced.length === 1 ? 'Sentence' : 'Sentences'} ${unplaced.join(', ')} `
        + `${unplaced.length === 1 ? 'has' : 'have'} no label yet. Every sentence is placed before anything is drafted.`);
    }
    // Criterion 5: a rule comparing something no task reads can never be
    // decided, and confirming it would draft a branch with nothing to test.
    const { rows: [latest] } = await db.query<{ tables: RuleTable[] | null }>(
      `SELECT tables FROM rule_tables WHERE workflow_id = $1 ORDER BY seq DESC LIMIT 1`, [workflowId]);
    const unread = unreadColumns(latest?.tables ?? []);
    if (unread.length) {
      return refuse(unreadAdvice(unread));
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
    // A sentence that reads like instructions to a machine is a risk somebody
    // acknowledges before this is published: it may be a document written to
    // steer Orbit rather than a procedure for a person.
    for (const s of sentences.filter((x) => x.suspicious)) {
      await db.query(
        `INSERT INTO workflow_note (workflow_id, kind, body) VALUES ($1, 'risk', $2)`,
        [workflowId, `Sentence ${s.number} ("${s.text.slice(0, 300)}"): ${s.suspicious}. Orbit treated it as text and `
          + 'did not follow it. Check the draft does only what the procedure asks.']);
    }

    // A sentence the run waits at becomes a step, not a note.
    for (const s of sentences.filter((x) => (x.label === 'forAPerson' && !x.waits) || x.label === 'wontDo')) {
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

export const nextPartAskedFor = object({
  body: z.string().max(PART_LIMIT, `A part can be at most ${PART_LIMIT.toLocaleString('en-US')} characters.`).optional(),
  pdf: pdfBase64.optional(),
  /** Whether still more is to come after this one. */
  moreToCome: z.boolean().default(false),
});

/**
 * The next part of a procedure brought in a page or two at a time (§13).
 *
 * Its sentences are numbered in its own part, so nothing already sorted or
 * relabelled is renumbered, and the worker sorts only what has no label yet.
 * Refused once the sort has been confirmed: the walk ran over what was there.
 */
export async function addNextPart(db: PoolClient, workflowId: string, body: unknown): Promise<Queued> {
  const asked = nextPartAskedFor.safeParse(body);
  if (!asked.success) return { ok: false, because: asked.error.issues.map((i) => i.message).join(' ') };
  if (Boolean(asked.data.body?.trim()) === Boolean(asked.data.pdf)) {
    return { ok: false, because: 'Paste the next part or upload it as a PDF — one of the two.' };
  }
  const read = await textOf({ procedure: asked.data.body, pdf: asked.data.pdf });
  if (!read.ok) return read;

  await db.query('BEGIN');
  try {
    const refuse = async (because: string): Promise<Queued> => { await db.query('ROLLBACK'); return { ok: false, because }; };
    const { rows: [u] } = await db.query<{ status: string; confirmed_at: string | null }>(
      `SELECT status, confirmed_at FROM understanding WHERE workflow_id = $1 FOR UPDATE`, [workflowId]);
    if (!u) return refuse('This draft was not brought in to be understood.');
    if (u.confirmed_at) {
      return refuse('The sort has been confirmed and drafted from, so a part added now would not be in the draft. '
        + 'Bring the whole procedure in again.');
    }
    if (u.status === 'queued' || u.status === 'sorting') {
      return refuse('Orbit is still sorting the last part. Add the next one when it has finished.');
    }
    const part = await insertPart(db, workflowId, { source: read.source, body: read.body }, read.pages);
    if (!part.ok) return refuse(part.because);
    await db.query(
      `UPDATE understanding SET status = 'queued', refused = NULL, sorted_at = NULL, lease_expires_at = NULL,
              claimed_by = NULL, queued_at = now(), more_to_come = $2
        WHERE workflow_id = $1`, [workflowId, asked.data.moreToCome]);
    await db.query('COMMIT');
    return { ok: true, id: workflowId };
  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  }
}

/** The author says whether more is to come. "That is all of it" closes the open end. */
export async function setMoreToCome(db: ClientBase, workflowId: string, body: unknown): Promise<Done> {
  const asked = object({ moreToCome: z.boolean() }).safeParse(body);
  if (!asked.success) return { ok: false, because: 'Say whether more of the procedure is to come.' };
  const { rows: [u] } = await db.query<{ confirmed_at: string | null }>(
    `SELECT confirmed_at FROM understanding WHERE workflow_id = $1`, [workflowId]);
  if (!u) return { ok: false, because: 'This draft was not brought in to be understood.' };
  if (u.confirmed_at) return { ok: false, because: 'The sort has already been confirmed.' };
  await db.query(`UPDATE understanding SET more_to_come = $2 WHERE workflow_id = $1`, [workflowId, asked.data.moreToCome]);
  await db.query(
    `INSERT INTO audit_entry (act, object_kind, object_id, changed) VALUES ($2, 'workflow', $1, '{}')`,
    [workflowId, asked.data.moreToCome ? 'more of the procedure is to come' : 'that is all of the procedure']);
  return { ok: true };
}
