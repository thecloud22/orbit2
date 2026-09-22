/**
 * A draft's procedure, held as parts and numbered sentences (Orbit 2.1).
 *
 * Nothing here calls a model. Adding a part splits it and stores the split;
 * recording a labelling checks it against the part's own sentence numbers and
 * keeps it only if it places every one exactly once. Where the labelling came
 * from — a model, or an author correcting one — is the caller's business.
 */
import {
  checkLabelling, coverage, nextPartKey, numberOf, object, partSource, z,
  type Coverage, type LabellingChecked, type SentenceLabel,
} from '@orbit/contract';
import { pageAt, segment } from '@orbit/procedure';
import type { ClientBase } from 'pg';

/** A long procedure arrives whole as a PDF; this bounds one part, not a document. */
export const PART_LIMIT = 250_000;

export const partAskedFor = object({
  source: partSource,
  // Not trimmed: the body is kept exactly as it arrived, and every sentence's
  // position is counted in it.
  body: z.string().max(PART_LIMIT, `A part can be at most ${PART_LIMIT.toLocaleString('en-US')} characters.`),
});

export type PartAdded =
  | { ok: true; key: string; sentences: string[]; unterminated: string | null }
  | { ok: false; because: string };

export async function addPart(db: ClientBase, workflowId: string, asked: unknown): Promise<PartAdded> {
  await db.query('BEGIN');
  try {
    const added = await insertPart(db, workflowId, asked);
    await db.query(added.ok ? 'COMMIT' : 'ROLLBACK');
    return added;
  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  }
}

/**
 * The same, inside a transaction the caller holds. `pages` is where each page
 * of a PDF sits in the body, so every sentence can say which page it is on.
 */
export async function insertPart(
  db: ClientBase, workflowId: string, asked: unknown,
  pages?: ReadonlyArray<{ page: number; start: number; end: number }>,
): Promise<PartAdded> {
  const parsed = partAskedFor.safeParse(asked);
  if (!parsed.success) return { ok: false, because: parsed.error.issues.map((i) => i.message).join(' ') };
  const { source, body } = parsed.data;

  const sentences = segment(body);
  if (sentences.length === 0) return { ok: false, because: 'There is nothing in this part to sort.' };

  // Two parts added at once must not both take key 2; the lock is on the
  // draft, and lasts until the caller's transaction ends.
  const { rows: [draft] } = await db.query(
    `SELECT id FROM workflow WHERE id = $1 AND archived_at IS NULL FOR UPDATE`, [workflowId]);
  if (!draft) return { ok: false, because: 'There is no such draft to add to.' };

  const { rows: taken } = await db.query<{ key: string }>(
    `SELECT key FROM procedure_part WHERE workflow_id = $1`, [workflowId]);
  const key = nextPartKey(taken.map((t) => t.key), source);

  const { rows: [part] } = await db.query<{ id: string }>(
    `INSERT INTO procedure_part (workflow_id, key, source, body) VALUES ($1, $2, $3, $4) RETURNING id`,
    [workflowId, key, source, body]);
  await db.query(
    `INSERT INTO procedure_sentence (part_id, n, text, kind, start_at, end_at, unterminated, page)
     SELECT $1, * FROM unnest($2::int[], $3::text[], $4::text[], $5::int[], $6::int[], $7::boolean[], $8::int[])`,
    [part!.id, sentences.map((s) => s.n), sentences.map((s) => s.text), sentences.map((s) => s.kind),
     sentences.map((s) => s.start), sentences.map((s) => s.end), sentences.map((s) => s.unterminated),
     sentences.map((s) => (pages ? pageAt(pages, s.start) : null))]);
  await db.query(
    `INSERT INTO audit_entry (act, object_kind, object_id, changed)
     VALUES ('procedure part added', 'workflow', $1, $2)`,
    [workflowId, JSON.stringify({ part: key, source, sentences: sentences.length })]);

  const last = sentences.at(-1)!;
  return {
    ok: true, key,
    sentences: sentences.map((s) => numberOf(key, s.n)),
    unterminated: last.unterminated ? numberOf(key, last.n) : null,
  };
}

async function sentencesOf(db: ClientBase, workflowId: string, partKey?: string) {
  const { rows } = await db.query<{ id: string; number: string }>(
    `SELECT s.id, p.key || '.' || s.n AS number
       FROM procedure_sentence s JOIN procedure_part p ON p.id = s.part_id
      WHERE p.workflow_id = $1 AND ($2::text IS NULL OR p.key = $2)
      ORDER BY p.added_at, p.key, s.n`, [workflowId, partKey ?? null]);
  return rows;
}

export type LabellingRecorded = LabellingChecked | { ok: false; because: string };

/**
 * Keeps a labelling of one part, or nothing. A labelling that skips, repeats
 * or invents a sentence writes no row at all, so a draft never holds half an
 * account of a part.
 */
export async function recordLabelling(
  db: ClientBase, workflowId: string, partKey: string, answer: unknown, givenBy: 'model' | 'author',
): Promise<LabellingRecorded> {
  const sentences = await sentencesOf(db, workflowId, partKey);
  if (sentences.length === 0) return { ok: false, because: `This draft has no part ${partKey}.` };

  const checked = checkLabelling(sentences.map((s) => s.number), answer);
  if (!checked.ok) return checked;

  const id = new Map(sentences.map((s) => [s.number, s.id]));
  await db.query(
    `INSERT INTO sentence_label (sentence_id, label, reason, basis, given_by)
     SELECT *, $5 FROM unnest($1::uuid[], $2::text[], $3::text[], $4::text[])`,
    [checked.labels.map((l) => id.get(l.sentence)), checked.labels.map((l) => l.label),
     checked.labels.map((l) => l.reason), checked.labels.map((l) => l.basis), givenBy]);
  return checked;
}

/** Every sentence of every part, and how many are placed under each label now. */
export async function readCoverage(db: ClientBase, workflowId: string): Promise<Coverage> {
  const sentences = await sentencesOf(db, workflowId);
  const { rows } = await db.query<{ number: string; label: SentenceLabel }>(
    `SELECT DISTINCT ON (l.sentence_id) p.key || '.' || s.n AS number, l.label
       FROM sentence_label l
       JOIN procedure_sentence s ON s.id = l.sentence_id
       JOIN procedure_part p ON p.id = s.part_id
      WHERE p.workflow_id = $1
      ORDER BY l.sentence_id, l.seq DESC`, [workflowId]);
  return coverage(sentences.map((s) => s.number), new Map(rows.map((r) => [r.number, r.label])));
}
