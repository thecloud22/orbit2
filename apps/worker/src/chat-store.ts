/**
 * A chat message answered and, where Orbit's checks pass, applied — in one
 * transaction with the model call that decided it, so the draft never holds an
 * edit without the conversation that asked for it (§12, guard rail 9).
 */
import type { PoolClient } from 'pg';
import type { ModelProvider } from '@orbit/model';
// The same part-writing the API uses when a part is pasted, so a part added
// from the chat is numbered, split and stored by the one piece of code that
// does it. It holds no connection of its own; it writes through the client.
import { insertPart } from '../../api/src/procedure.ts';
import { CHAT_REFUSALS, decide } from './chat.ts';
import { storeTurn } from './sort-store.ts';

export async function answerAndStore(db: PoolClient, messageId: string, model: ModelProvider): Promise<string> {
  const { rows: [m] } = await db.query<{ workflow_id: string; text: string }>(
    `SELECT workflow_id, text FROM chat_message WHERE id = $1 AND state = 'waiting'`, [messageId]);
  if (!m) return 'nothing waiting';
  const workflowId = m.workflow_id;

  const { rows: [app] } = await db.query<{ name: string; hosts: string[] }>(
    `SELECT a.name, (SELECT array_agg(x->>'host') FROM jsonb_array_elements(r.addresses) x) AS hosts
       FROM understanding u JOIN application a ON a.id = u.application_id
       JOIN LATERAL (SELECT addresses FROM application_revision WHERE application_id = a.id
                      ORDER BY revision DESC LIMIT 1) r ON true
      WHERE u.workflow_id = $1`, [workflowId]);
  // The draft as it now reads (Decision 17), without what was taken out.
  const { rows: draft } = await db.query<{ number: string; text: string; label: string | null }>(
    `SELECT p.key || '.' || s.n AS number, s.text, l.label
       FROM sentence_now s JOIN procedure_part p ON p.id = s.part_id
       LEFT JOIN LATERAL (SELECT label FROM sentence_label WHERE sentence_id = s.id ORDER BY seq DESC LIMIT 1) l ON true
      WHERE p.workflow_id = $1 AND NOT s.withdrawn ORDER BY p.added_at, p.key, s.n`, [workflowId]);

  const { decision, answered } = await decide(m.text, draft, { name: app!.name, hosts: app!.hosts ?? [] }, model);

  await db.query('BEGIN');
  try {
    const { rows: [last] } = await db.query<{ turn: number }>(
      `SELECT coalesce(max(turn), 0)::int AS turn FROM model_call WHERE workflow_id = $1`, [workflowId]);
    await storeTurn(db, workflowId, {
      turn: last!.turn + 1, shown: { asking: m.text, sentences: [] }, answered: answered.value,
      verdict: answered.value ? 'kept' : 'discarded', why: `chat: ${decision.do}`,
      model: answered.model, provider: answered.provider, tokensIn: answered.tokensIn, tokensOut: answered.tokensOut,
      tokensCached: answered.tokensCached, tokensCacheWritten: answered.tokensCacheWritten,
      costMicros: answered.costUnknown ? null : answered.costMicros,
    });
    await db.query(`UPDATE chat_message SET state = 'answered' WHERE id = $1`, [messageId]);

    const say = (text: string, state: string, outcome: unknown) => db.query(
      `INSERT INTO chat_message (workflow_id, said_by, text, state, outcome, answers) VALUES ($1, 'orbit', $2, $3, $4, $5)`,
      [workflowId, text, state, JSON.stringify(outcome), messageId]);

    // The draft may have moved on while the model answered.
    const { rows: [u] } = await db.query<{ status: string; closed: boolean }>(
      `SELECT u.status, (w.confirmed_at IS NOT NULL AND EXISTS (SELECT 1 FROM workflow_version v WHERE v.workflow_id = w.id)) AS closed
         FROM understanding u JOIN workflow w ON w.id = u.workflow_id WHERE u.workflow_id = $1 FOR UPDATE OF u`, [workflowId]);
    // Open until publication (R21); a change lapses a confirmation.
    const open = u && !u.closed && u.status === 'sorted';
    const resort = async () => {
      await db.query(
        `UPDATE understanding SET status = 'queued', sorted_at = NULL, lease_expires_at = NULL, claimed_by = NULL
          WHERE workflow_id = $1`, [workflowId]);
      await db.query(`UPDATE workflow SET confirmed_at = NULL, updated_at = now() WHERE id = $1`, [workflowId]);
    };

    let outcome = decision.do as string;
    if (!open && (decision.do === 'addSteps' || decision.do === 'relabel' || decision.do === 'offerRevision')) {
      await say(u?.closed ? CHAT_REFUSALS.closed : CHAT_REFUSALS.busy, 'refused', { refused: 'notOpen' });
      outcome = 'refused';
    } else if (decision.do === 'addSteps') {
      const part = await insertPart(db, workflowId, { source: 'author', body: m.text });
      if (!part.ok) {
        await say(part.because, 'refused', { refused: 'part' });
      } else {
        await say(`Added your words as part ${part.key} (${part.sentences.join(', ')})`
          + `${decision.departs ? ', marked Not in the procedure' : ''}. Orbit is sorting them now.`,
          'applied', { part: part.key, sentences: part.sentences, departs: decision.departs });
        await resort();
      }
    } else if (decision.do === 'relabel') {
      const [key, n] = decision.sentence.split('.') as [string, string];
      await db.query(
        `INSERT INTO sentence_label (sentence_id, label, reason, basis, given_by)
         SELECT s.id, $3, $4, 'stated', 'author'
           FROM procedure_sentence s JOIN procedure_part p ON p.id = s.part_id
          WHERE p.workflow_id = $1 AND p.key = $2 AND s.n = $5`,
        [workflowId, key, decision.label, `Asked for in the chat: "${m.text.slice(0, 300)}"`, Number(n)]);
      await say(`Sentence ${decision.sentence} is now ${decision.label}.`, 'applied',
        { sentence: decision.sentence, label: decision.label });
      await resort();
    } else if (decision.do === 'offerRevision') {
      // Proposed, never applied: the author takes it up or does not.
      await say(`${decision.sentence} would read: \u201c${decision.text}\u201d`, 'offered',
        { offer: 'revise', sentence: decision.sentence, text: decision.text });
    } else if (decision.do === 'explain') {
      await say(decision.reply, 'explained', null);
    } else if (decision.do === 'offerForAPerson') {
      await say(CHAT_REFUSALS.changesData, 'offered', { offer: 'forAPerson' });
    } else {
      await say(CHAT_REFUSALS[decision.why], 'refused', { refused: decision.why });
    }
    await db.query('COMMIT');
    return outcome;
  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  }
}
