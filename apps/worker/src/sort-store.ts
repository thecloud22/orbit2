/**
 * A sort, stored: every call it made, and — only if every sentence was
 * placed — the labels. One transaction, so a draft never holds labels without
 * the calls that produced them, or half a sort.
 */
import type { PoolClient } from 'pg';
import type { ModelProvider } from '@orbit/model';
import { sortSentences, type SortTurn } from './sort.ts';

export type SortStored = { sorted: true; labelled: number } | { sorted: false; describe: string };

export async function sortAndStore(db: PoolClient, workflowId: string, model: ModelProvider): Promise<SortStored> {
  // Only what has no label yet: a part added later is sorted on its own, and
  // a sentence a person has already relabelled is not asked about again.
  const { rows: sentences } = await db.query<{ id: string; number: string; text: string; kind: string }>(
    `SELECT s.id, p.key || '.' || s.n AS number, s.text, s.kind
       FROM procedure_sentence s JOIN procedure_part p ON p.id = s.part_id
      WHERE p.workflow_id = $1
        AND NOT EXISTS (SELECT 1 FROM sentence_label l WHERE l.sentence_id = s.id)
      ORDER BY p.added_at, p.key, s.n`, [workflowId]);
  if (sentences.length === 0) return { sorted: true, labelled: 0 };

  const { rows: [last] } = await db.query<{ turn: number }>(
    `SELECT coalesce(max(turn), 0)::int AS turn FROM model_call WHERE workflow_id = $1`, [workflowId]);
  // A later part is sorted with the end of what came before it in view: its
  // first sentence may carry on from the last one of the previous part.
  const { rows: before } = await db.query<{ number: string; text: string; kind: string; label: string }>(
    `SELECT * FROM (
       SELECT p.key || '.' || s.n AS number, s.text, s.kind, l.label, p.added_at, p.key, s.n
         FROM procedure_sentence s JOIN procedure_part p ON p.id = s.part_id
         JOIN LATERAL (SELECT label FROM sentence_label WHERE sentence_id = s.id ORDER BY seq DESC LIMIT 1) l ON true
        WHERE p.workflow_id = $1
        ORDER BY p.added_at DESC, p.key DESC, s.n DESC LIMIT 6) t
      ORDER BY added_at, key, n`, [workflowId]);
  const result = await sortSentences(sentences, model, last!.turn + 1, before);

  await db.query('BEGIN');
  try {
    for (const turn of result.turns) await storeTurn(db, workflowId, turn);
    if (result.ok) {
      const id = new Map(sentences.map((s) => [s.number, s.id]));
      await db.query(
        `INSERT INTO sentence_label (sentence_id, label, reason, basis, given_by)
         SELECT *, 'model' FROM unnest($1::uuid[], $2::text[], $3::text[], $4::text[])`,
        [result.labels.map((l) => id.get(l.sentence)), result.labels.map((l) => l.label),
         result.labels.map((l) => l.reason), result.labels.map((l) => l.basis)]);
    }
    await db.query(
      `INSERT INTO audit_entry (act, object_kind, object_id, changed)
       VALUES ($2, 'workflow', $1, $3)`,
      [workflowId, result.ok ? 'procedure sorted' : 'procedure could not be sorted',
       JSON.stringify({ sentences: sentences.length, calls: result.turns.length,
         producedNothing: result.turns.filter((t) => t.verdict !== 'kept').length,
         model: result.turns[0]?.model ?? null })]);
    await db.query('COMMIT');
  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  }
  return result.ok ? { sorted: true, labelled: result.labels.length } : { sorted: false, describe: result.describe };
}

async function storeTurn(db: PoolClient, workflowId: string, turn: SortTurn): Promise<void> {
  await db.query(
    `INSERT INTO model_call
       (workflow_id, turn, provider, model, shown, answered, verdict, why, tokens_in, tokens_out,
        tokens_cached, tokens_cache_written, cost_micros)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
    [workflowId, turn.turn, turn.provider, turn.model, JSON.stringify(turn.shown),
     turn.answered === null ? null : JSON.stringify(turn.answered),
     turn.verdict, turn.why, turn.tokensIn, turn.tokensOut, turn.tokensCached, turn.tokensCacheWritten,
     turn.costMicros]);
}
