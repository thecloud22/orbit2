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
import { insertPart, PART_LIMIT, readCoverage } from './procedure.ts';
import { forTheWalk, sentencesWithLabels, type SentenceView } from './sentences.ts';

export { forTheWalk, sentencesWithLabels, type SentenceView };
import { chatOf } from './chat.ts';
import { draftFromSort } from './drafting.ts';
import { refusedText } from './revise.ts';
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
  /** Typed in place on the page, and may wait (E4): left empty, the agent takes its first heading. */
  name: z.string().trim().max(160).optional(),
  procedure: z.string().min(20, 'Say a little more — this is the whole description Orbit works from.')
    .max(PART_LIMIT, `A procedure pasted in one go can be at most ${PART_LIMIT.toLocaleString('en-US')} characters.`)
    .optional(),
  pdf: pdfBase64.optional(),
  /** The author says this is not all of it, and will add the rest as parts (§13). */
  moreToCome: z.boolean().default(false),
  /** Start from a blank page and write it in the editor (R22). */
  blank: z.boolean().default(false),
  /**
   * With `blank`: the first words, written by hand on the new page (E1). Kept
   * as the author's own, sorted, and drafted straight through like a paste (E3).
   */
  firstWords: z.string().trim().min(1).max(4000).optional(),
  /** The other systems the procedure uses, picked on the same page (E2, Decision 19). */
  alsoOn: z.array(object({ applicationId: z.uuid(), startPath: z.string().trim().min(1).max(2048).default('/') })).max(8).default([]),
});

/** A name for an agent nobody has named yet (E4): its first heading, or "Untitled agent". */
export function nameFrom(text: string): string {
  const first = text.split('\n').map((l) => l.trim()).find(Boolean) ?? '';
  const heading = first.replace(/^#+\s*/, '');
  return heading.length >= 3 && heading.length <= 80 && !/[.!?]$/.test(heading) ? heading : 'Untitled agent';
}

export async function bringInToUnderstand(db: PoolClient, body: unknown): Promise<Queued> {
  const asked = understandingAskedFor.safeParse(body);
  if (!asked.success) {
    return { ok: false, because: asked.error.issues
      .map((i) => i.message || `${i.path.join('.')} is not right`).join(' ') };
  }
  const { applicationId, startPath, inputs, moreToCome, blank, firstWords, alsoOn } = asked.data;
  if (!blank && Boolean(asked.data.procedure) === Boolean(asked.data.pdf)) {
    return { ok: false, because: 'Paste the procedure or upload it as a PDF — one of the two.' };
  }
  if (firstWords && !blank) return { ok: false, because: 'First words are for a procedure written on the page.' };
  const read = blank ? { ok: true as const, source: 'pasted' as const, body: '' } : await textOf(asked.data);
  if (!read.ok) return read;
  const procedure = read.body;
  const name = asked.data.name || nameFrom(firstWords ?? procedure);

  // Every system picked: registered, in service, and each once.
  const picked = [applicationId, ...alsoOn.map((a) => a.applicationId)];
  if (new Set(picked).size !== picked.length) return { ok: false, because: 'The same system was picked twice.' };
  const { rows: apps } = await db.query<{ id: string; name: string; retired_at: string | null; hosts: string[] | null }>(
    `SELECT a.id, a.name, a.retired_at,
            (SELECT array_agg(x->>'host') FROM jsonb_array_elements(r.addresses) x) AS hosts
       FROM application a
       JOIN LATERAL (SELECT addresses FROM application_revision WHERE application_id = a.id ORDER BY revision DESC LIMIT 1) r ON true
      WHERE a.id = ANY($1)`, [picked]);
  const app = apps.find((a) => a.id === applicationId);
  if (!app || apps.length !== picked.length) return { ok: false, because: 'There is no application registered with that reference.' };
  const retired = apps.find((a) => a.retired_at);
  if (retired) {
    return { ok: false, because: `${retired.name} has been retired, so nothing new can be brought in against it.` };
  }
  if (firstWords) {
    const refused = refusedText(firstWords, apps.flatMap((a) => a.hosts ?? []));
    if (refused) return { ok: false, because: refused };
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
    // each sentence the author writes is sorted as it arrives (R22). Words
    // that arrive whole — pasted, a PDF, or written on the new page and kept —
    // are drafted as soon as they are sorted (E5).
    const sortNow = !blank || Boolean(firstWords);
    await db.query(
      `INSERT INTO understanding (workflow_id, application_id, start_path, inputs, more_to_come, status, sorted_at, draft_when_sorted)
       VALUES ($1, $2, $3, $4, $5, $6, CASE WHEN $6 = 'sorted' THEN now() END, $7)`,
      [workflowId, applicationId, startPath, JSON.stringify(inputs), moreToCome, sortNow ? 'queued' : 'sorted', sortNow]);
    for (const other of alsoOn) {
      await db.query(`INSERT INTO workflow_application (workflow_id, application_id, start_path) VALUES ($1, $2, $3)`,
        [workflowId, other.applicationId, other.startPath.startsWith('/') ? other.startPath : `/${other.startPath}`]);
    }
    const part = firstWords ? await insertPart(db, workflowId, { source: 'author', body: firstWords })
      : blank ? { ok: true as const, sentences: [] as string[] }
      : await insertPart(db, workflowId, { source: read.source, body: procedure }, 'pages' in read ? read.pages : undefined);
    if (!part.ok) {
      await db.query('ROLLBACK');
      return { ok: false, because: part.because };
    }
    await db.query(
      `INSERT INTO audit_entry (act, object_kind, object_id, changed)
       VALUES ('procedure brought in to be understood', 'workflow', $1, $2)`,
      [workflowId, JSON.stringify({ name, application: app.name, sentences: part.sentences.length, blank,
        ...(alsoOn.length ? { alsoOn: apps.filter((a) => a.id !== applicationId).map((a) => a.name) } : {}) })]);
    await db.query('COMMIT');
    return { ok: true, id: workflowId };
  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  }
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
  // Whether the run waits here was asked after drafting (E7); a relabel answers it.
  await db.query(
    `UPDATE workflow_note SET answer = $3, resolved_at = now()
      WHERE workflow_id = $1 AND sentence = $2 AND action = 'waitHere' AND resolved_at IS NULL`,
    [workflowId, sentence, waits ? 'The run waits here until the person has done it.'
      : label === 'forAPerson' ? 'The run carries on. Left to a person; Orbit does not do this.' : 'It is not work for a person after all.']);
  // The rules as tables are made from the labels, so a relabel sends the
  // draft back to the worker to make them again. Nothing is re-sorted: every
  // sentence already has a label.
  await db.query(
    `UPDATE understanding SET status = 'queued', sorted_at = NULL, lease_expires_at = NULL, claimed_by = NULL
      WHERE workflow_id = $1`, [workflowId]);
  return { ok: true };
}

/**
 * The author says "Draft it": for a procedure written by hand on the page,
 * or one that stopped because more was to come (E3, E6). A procedure that
 * arrived whole is drafted by Orbit as soon as it is sorted, with the same
 * routine (drafting.ts).
 */
export async function confirmUnderstanding(db: PoolClient, workflowId: string): Promise<Queued> {
  await db.query('BEGIN');
  try {
    const drafted = await draftFromSort(db, workflowId, 'author');
    await db.query(drafted.ok ? 'COMMIT' : 'ROLLBACK');
    return drafted.ok ? drafted : { ok: false, because: drafted.because };
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
              claimed_by = NULL, queued_at = now(), more_to_come = $2, not_drafted = NULL
        WHERE workflow_id = $1`, [workflowId, asked.data.moreToCome]);
    await db.query('COMMIT');
    return { ok: true, id: workflowId };
  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  }
}

/**
 * The author says whether more is to come. "That is all of it" closes the open
 * end, and a procedure that arrived whole is drafted there and then (E6).
 * "More to come" holds drafting off, until the sort is confirmed.
 */
export async function setMoreToCome(db: PoolClient, workflowId: string, body: unknown): Promise<Done> {
  const asked = object({ moreToCome: z.boolean() }).safeParse(body);
  if (!asked.success) return { ok: false, because: 'Say whether more of the procedure is to come.' };
  await db.query('BEGIN');
  try {
    const { rows: [u] } = await db.query<{ confirmed_at: string | null; status: string; draft_when_sorted: boolean }>(
      `SELECT confirmed_at, status, draft_when_sorted FROM understanding WHERE workflow_id = $1 FOR UPDATE`, [workflowId]);
    if (!u) { await db.query('ROLLBACK'); return { ok: false, because: 'This draft was not brought in to be understood.' }; }
    if (u.confirmed_at) { await db.query('ROLLBACK'); return { ok: false, because: 'Orbit has already drafted it.' }; }
    await db.query(`UPDATE understanding SET more_to_come = $2, not_drafted = NULL WHERE workflow_id = $1`, [workflowId, asked.data.moreToCome]);
    await db.query(
      `INSERT INTO audit_entry (act, object_kind, object_id, changed) VALUES ($2, 'workflow', $1, '{}')`,
      [workflowId, asked.data.moreToCome ? 'more of the procedure is to come' : 'that is all of the procedure']);
    if (!asked.data.moreToCome && u.draft_when_sorted && u.status === 'sorted') {
      const drafted = await draftFromSort(db, workflowId, 'orbit');
      if (!drafted.ok) await db.query(`UPDATE understanding SET not_drafted = $2 WHERE workflow_id = $1`, [workflowId, drafted.because]);
    }
    await db.query('COMMIT');
    return { ok: true };
  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  }
}
