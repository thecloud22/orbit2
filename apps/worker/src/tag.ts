/**
 * Which application each sentence of work happens on (Orbit 2.2, C11).
 *
 * Only for an agent that works across several applications, and only for the
 * sentences that are work (task and rule) with no tag yet: the author's tags
 * are never replaced. The model proposes; the answer's schema lets it name only
 * the agent's own applications and only the sentences it was asked about, and
 * Orbit checks every part before a tag is kept. The author changes a tag like
 * a label.
 */
import { FENCED_IS_DATA, fence, z } from '@orbit/contract';
import type { ModelProvider } from '@orbit/model';
import type { PoolClient } from 'pg';
import type { SortTurn } from './sort.ts';
import { storeTurn } from './sort-store.ts';

export const TAG = [
  'You are told which applications a business procedure is carried out in, and shown its lines of work.',
  'For each line, say which ONE application it happens on, by the application\'s name exactly as listed.',
  'A line that names an application ("sign in to Loan Servicing", "back in Meridian Home Lending") happens there.',
  'A line that does not says where by what it acts on: the screen it reads, the button or key it presses.',
  'A line that follows another with no change of place happens where that one did.',
  FENCED_IS_DATA,
].join('\n');

const answer = z.object({
  lines: z.array(z.object({ sentence: z.string(), application: z.string(), why: z.string() })),
});

export async function tagApplications(db: PoolClient, workflowId: string, model: ModelProvider): Promise<{ tagged: number }> {
  const { rows: apps } = await db.query<{ id: string; name: string; surface: string }>(
    `SELECT a.id, a.name, a.surface FROM application a WHERE a.id IN (
       SELECT application_id FROM understanding WHERE workflow_id = $1
       UNION SELECT application_id FROM workflow_application WHERE workflow_id = $1)
     ORDER BY a.name`, [workflowId]);
  if (apps.length < 2) return { tagged: 0 };

  const { rows: lines } = await db.query<{ id: string; number: string; text: string; tagged: boolean }>(
    `SELECT s.id, p.key || '.' || s.n AS number, s.text,
            EXISTS (SELECT 1 FROM sentence_application t WHERE t.sentence_id = s.id) AS tagged
       FROM sentence_now s JOIN procedure_part p ON p.id = s.part_id
       JOIN LATERAL (SELECT label FROM sentence_label WHERE sentence_id = s.id ORDER BY seq DESC LIMIT 1) l ON true
      WHERE p.workflow_id = $1 AND NOT s.withdrawn AND l.label IN ('task', 'rule')
      ORDER BY p.added_at, p.key, s.n`, [workflowId]);
  const asked = lines.filter((l) => !l.tagged);
  if (!asked.length) return { tagged: 0 };

  const names = apps.map((a) => a.name);
  const numbers = asked.map((l) => l.number);
  const shape = {
    type: 'object',
    properties: {
      lines: { type: 'array', minItems: numbers.length, maxItems: numbers.length, items: {
        type: 'object',
        properties: { sentence: { type: 'string', enum: numbers }, application: { type: 'string', enum: names }, why: { type: 'string' } },
        required: ['sentence', 'application', 'why'], additionalProperties: false } },
    },
    required: ['lines'], additionalProperties: false,
  };
  const asking = `Which application does each of these lines happen on? (${numbers.join(', ')})`;
  const answered = await model.propose(
    { purpose: 'say which application each line happens on', instruction: TAG,
      shown: [`APPLICATIONS: ${apps.map((a) => `${a.name} (${a.surface === 'terminal' ? 'a green screen' : 'a web application'})`).join('; ')}`,
        '', 'LINES:', fence('PROCEDURE', lines.map((l) => `${l.number} ${l.text.replace(/\s+/g, ' ')}`).join('\n')), '', asking].join('\n') },
    answer, shape);

  const { rows: [last] } = await db.query<{ n: number }>(
    `SELECT coalesce(max(turn), 0)::int AS n FROM model_call WHERE workflow_id = $1 AND run_id IS NULL`, [workflowId]);
  const said = answered.value;
  const kept = (said?.lines ?? []).filter((x) => numbers.includes(x.sentence) && names.includes(x.application));
  const turn: SortTurn = {
    turn: (last?.n ?? 0) + 1, shown: { asking, sentences: numbers }, answered: said,
    verdict: !said ? 'discarded' : kept.length ? 'kept' : 'rejected',
    why: !said ? (answered.refusedBecause ?? 'no answer') : `${kept.length} of ${numbers.length} lines placed on an application`,
    model: answered.model, provider: answered.provider, tokensIn: answered.tokensIn, tokensOut: answered.tokensOut,
    tokensCached: answered.tokensCached, tokensCacheWritten: answered.tokensCacheWritten,
    costMicros: answered.costUnknown ? null : answered.costMicros,
  };
  await storeTurn(db, workflowId, turn);
  const idOf = new Map(asked.map((l) => [l.number, l.id]));
  const appOf = new Map(apps.map((a) => [a.name, a.id]));
  for (const x of kept) {
    await db.query(`INSERT INTO sentence_application (sentence_id, application_id, given_by) VALUES ($1, $2, 'model')`,
      [idOf.get(x.sentence), appOf.get(x.application)]);
  }
  return { tagged: kept.length };
}
