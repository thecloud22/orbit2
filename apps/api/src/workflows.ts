import type { ClientBase } from 'pg';
import type { RuleTable } from '@orbit/contract';
import { pool } from './db.ts';
import { asDraftStep } from './publish.ts';
import { sentencesWithLabels, type SentenceView } from './understanding.ts';
import { chatOf } from './chat.ts';

/** A sentence as the editor lays it out: whether it starts a new block of the document. */
export type DocumentSentence = SentenceView & { startsBlock: boolean };

/**
 * The procedure as the author wrote it, sentence by sentence, with where each
 * block of the document begins (procedure editor R2, R3).
 *
 * A heading stands alone, and so does each of the author's list items; a
 * sentence after a blank line starts a new paragraph; anything else carries on
 * the block before it — "3. If there is no such file, say so. This happens…"
 * is one item. Decided from the part's own text, never from the model.
 */
export async function documentOf(db: ClientBase, workflowId: string): Promise<DocumentSentence[] | null> {
  const sentences = await sentencesWithLabels(db, workflowId);
  if (!sentences.length) return null;
  const { rows: spans } = await db.query<{ number: string; start_at: number; body: string }>(
    `SELECT p.key || '.' || s.n AS number, s.start_at, p.body
       FROM procedure_sentence s JOIN procedure_part p ON p.id = s.part_id
      WHERE p.workflow_id = $1`, [workflowId]);
  const at = new Map(spans.map((r) => [r.number, r]));
  return sentences.map((s, i) => {
    const before = sentences[i - 1];
    if (!before || before.part !== s.part) return { ...s, startsBlock: true };
    const here = at.get(s.number);
    const prev = at.get(before.number);
    // The whitespace between this sentence and the one before it.
    const gap = here && prev ? here.body.slice(prev.start_at + before.text.length, here.start_at) : '';
    const startsBlock = s.kind === 'heading' || s.kind === 'item' || before.kind === 'heading'
      || /\n\s*\n/.test(gap) || (before.kind === 'leadIn');
    return { ...s, startsBlock };
  });
}

/**
 * A draft, and how it came to say what it says.
 *
 * The turns are served alongside the steps rather than behind a separate
 * request, because they are not diagnostics — §12 keeps authoring provenance
 * "as evidence rather than as a log", and a reviewer asking "why does step 4
 * read that?" should not have to go looking.
 */
export async function readWorkflow(id: string, db: ClientBase = pool as unknown as ClientBase) {
  const { rows: [workflow] } = await db.query(
    `SELECT id, name, describe, procedure, confirmed_at, created_at,
            coalesce(declared_inputs, '[]'::jsonb) AS declared_inputs,
            live_version_id, paused_at
       FROM workflow WHERE id = $1`, [id]);
  if (!workflow) return null;

  const { rows: stepRows } = await db.query<{
    id: string; position: number; kind: string; declares: Record<string, unknown>; complete: boolean;
    from_sentence: string | null; made_at_turn: number | null;
  }>(`SELECT id, position, kind, declares, complete, from_sentence, made_at_turn FROM workflow_step
      WHERE workflow_id = $1 ORDER BY position`, [id]);

  // What each step does not say yet, decided by the schema rather than by the
  // screen. `complete` is a column somebody set; this is the thing itself.
  // They disagreed: confirmation wrote `complete = true` without re-parsing,
  // so a hand-added ending arrived here marked finished and was then refused
  // at publication for the `publishes` it never had.
  const steps = stepRows.map((r) => {
    const parsed = asDraftStep(r);
    return { ...r, missing: 'incomplete' in parsed ? parsed.missing : [] };
  });
  const { rows: notes } = await db.query(
    `SELECT id, step_id, kind, body, answer, resolved_at FROM workflow_note
      WHERE workflow_id = $1 ORDER BY created_at`, [id]);
  const { rows: turns } = await db.query(
    `SELECT turn, provider, model, shown, answered, verdict, why, tokens_in, tokens_out, cost_micros, screenshot
       FROM model_call WHERE workflow_id = $1 ORDER BY turn`, [id]);
  // Activation is the workflow's pointer, not a column on the version — a
  // version is a fact and cannot be rewritten to say it went live (0008).
  const { rows: versions } = await db.query(
    `SELECT v.id, v.version, v.digest, v.published_at, v.body->'understanding'->'coverage' AS coverage,
            (v.id = w.live_version_id) AS live, w.paused_at
       FROM workflow_version v JOIN workflow w ON w.id = v.workflow_id
      WHERE v.workflow_id = $1 ORDER BY v.version DESC`, [id]);

  // Orbit 2.1: where the sort stands, for a draft that was brought in to be understood.
  const { rows: [understanding] } = await db.query(
    `SELECT u.status, u.confirmed_at, u.inputs AS examples, a.name AS application, s.status AS walk, u.session_id
       FROM understanding u JOIN application a ON a.id = u.application_id
       LEFT JOIN authoring_session s ON s.id = u.session_id
      WHERE u.workflow_id = $1`, [id]);

  // What the editor lays out: the procedure, its rules as tables, and the conversation.
  const document = await documentOf(db, id);
  const { rows: [tables] } = await db.query<{ tables: RuleTable[] | null }>(
    `SELECT tables FROM rule_tables WHERE workflow_id = $1 ORDER BY seq DESC LIMIT 1`, [id]);
  const rules = tables?.tables ?? null;
  const chat = await chatOf(db, id);

  // The latest test of this agent, so the editor can put what a run actually
  // held beside what the draft says it will hold (the DataStore tab).
  const { rows: [lastRun] } = await db.query(
    `SELECT r.reference, r.status, r.outcome, v.version
       FROM run r JOIN workflow_version v ON v.id = r.version_id
      WHERE v.workflow_id = $1 ORDER BY r.queued_at DESC LIMIT 1`, [id]);

  return {
    workflow, steps, notes, versions, understanding: understanding ?? null,
    document, rules, chat, lastRun: lastRun ?? null,
    authoring: {
      turns,
      /** Kept apart on purpose: a count of turns that says nothing about how
       *  many produced nothing usable is the flattering half of the number. */
      producedNothing: turns.filter((t) => t.verdict !== 'kept').length,
      costMicros: turns.reduce((sum, t) => sum + Number(t.cost_micros ?? 0), 0),
      /** A null cost is a turn whose model has no price held, not a free one.
       *  Summed as zero it reads as "this cost nothing to build", which is a
       *  figure nobody can act on and one the spend record must not assert. */
      costUnknown: turns.some((t) => t.cost_micros === null),
    },
  };
}

export async function listWorkflows() {
  const { rows } = await pool.query(
    `SELECT w.id, w.name, w.confirmed_at, w.created_at,
            (SELECT count(*) FROM workflow_step s WHERE s.workflow_id = w.id) AS steps,
            (SELECT count(*) FROM workflow_note n WHERE n.workflow_id = w.id AND n.resolved_at IS NULL) AS outstanding,
            (SELECT max(version) FROM workflow_version v WHERE v.workflow_id = w.id) AS live_version
       FROM workflow w WHERE w.archived_at IS NULL ORDER BY w.created_at DESC`);
  return rows;
}
