/**
 * Changing a draft by chat (Orbit 2.1, plan §12): taking a message in.
 *
 * Everything that can be decided without a model is decided here, before a
 * model could see the message. A message that reads like a secret is not sent
 * and not kept — only that one was blocked. One naming an address outside
 * this workflow's application is not sent. The rest waits for the worker,
 * which is the only process that talks to a model.
 */
import { CHAT_REFUSALS, looksLikeSecret, object, outsideAddresses, z, type ChatRefusal } from '@orbit/contract';
import type { ClientBase, PoolClient } from 'pg';
import { insertPart } from './procedure.ts';
import { reviseSentence } from './revise.ts';

/** Per draft, per day. A limit rather than a meter: the workspace's model budget is spent here. */
export const DAILY_MESSAGES = 40;

export const messageAskedFor = object({ text: z.string().trim().min(1, 'Say what to change.').max(2000) });

export type Sent = { ok: true; id: string; state: 'waiting' | 'blocked' | 'answered' } | { ok: false; because: string };

async function refuseWith(db: ClientBase, workflowId: string, answers: string, why: ChatRefusal) {
  await db.query(
    `INSERT INTO chat_message (workflow_id, said_by, text, state, outcome, answers)
     VALUES ($1, 'orbit', $2, 'refused', $3, $4)`,
    [workflowId, CHAT_REFUSALS[why], JSON.stringify({ refused: why }), answers]);
}

export async function sendMessage(db: PoolClient, workflowId: string, body: unknown): Promise<Sent> {
  const asked = messageAskedFor.safeParse(body);
  if (!asked.success) return { ok: false, because: asked.error.issues.map((i) => i.message).join(' ') };
  const { text } = asked.data;

  const { rows: [u] } = await db.query<{ status: string; closed: boolean; hosts: string[] }>(
    `SELECT u.status,
            -- Open until publication (R21): closed only on a published agent nobody has taken back to editing.
            (w.confirmed_at IS NOT NULL AND EXISTS (SELECT 1 FROM workflow_version v WHERE v.workflow_id = w.id)) AS closed,
            (SELECT array_agg(a->>'host') FROM jsonb_array_elements(r.addresses) a) AS hosts
       FROM understanding u JOIN workflow w ON w.id = u.workflow_id
       JOIN LATERAL (SELECT addresses FROM application_revision
                      WHERE application_id = u.application_id ORDER BY revision DESC LIMIT 1) r ON true
      WHERE u.workflow_id = $1`, [workflowId]);
  if (!u) return { ok: false, because: 'This draft was not brought in to be understood, so it has no chat.' };
  if (u.closed) return { ok: false, because: CHAT_REFUSALS.closed };
  if (u.status !== 'sorted') return { ok: false, because: CHAT_REFUSALS.busy };

  const { rows: [pending] } = await db.query(
    `SELECT 1 FROM chat_message WHERE workflow_id = $1 AND state = 'waiting'`, [workflowId]);
  if (pending) return { ok: false, because: CHAT_REFUSALS.busy };
  const { rows: [today] } = await db.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM chat_message
      WHERE workflow_id = $1 AND said_by = 'author' AND created_at > now() - interval '1 day'`, [workflowId]);
  if (today!.n >= DAILY_MESSAGES) return { ok: false, because: CHAT_REFUSALS.limit };

  await db.query('BEGIN');
  try {
    let id: string; let state: 'waiting' | 'blocked' | 'answered';
    if (looksLikeSecret(text)) {
      // Kept as the fact that something was blocked, and nothing of what it said.
      const { rows: [m] } = await db.query<{ id: string }>(
        `INSERT INTO chat_message (workflow_id, said_by, text, state) VALUES ($1, 'author', NULL, 'blocked') RETURNING id`,
        [workflowId]);
      id = m!.id; state = 'blocked';
      await refuseWith(db, workflowId, id, 'secret');
    } else if (outsideAddresses(text, u.hosts ?? []).length) {
      const { rows: [m] } = await db.query<{ id: string }>(
        `INSERT INTO chat_message (workflow_id, said_by, text, state) VALUES ($1, 'author', $2, 'answered') RETURNING id`,
        [workflowId, text]);
      id = m!.id; state = 'answered';
      await refuseWith(db, workflowId, id, 'addressNotSent');
    } else {
      const { rows: [m] } = await db.query<{ id: string }>(
        `INSERT INTO chat_message (workflow_id, said_by, text, state) VALUES ($1, 'author', $2, 'waiting') RETURNING id`,
        [workflowId, text]);
      id = m!.id; state = 'waiting';
    }
    await db.query('COMMIT');
    return { ok: true, id, state };
  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  }
}

/**
 * The author takes up the chat's offer to add something as work for a person,
 * which is what a request that would change data becomes. Their message is
 * the part, in their words, and every sentence of it is theirs to label.
 */
export async function takeOffer(db: PoolClient, workflowId: string, body: unknown): Promise<Sent> {
  const asked = object({ messageId: z.uuid() }).safeParse(body);
  if (!asked.success) return { ok: false, because: 'Say which offer.' };

  await db.query('BEGIN');
  try {
    const refuse = async (because: string): Promise<Sent> => { await db.query('ROLLBACK'); return { ok: false, because }; };
    const { rows: [offer] } = await db.query<{ text: string; taken: boolean; outcome: { offer?: string; sentence?: string; text?: string } | null }>(
      `SELECT a.text, o.outcome,
              EXISTS (SELECT 1 FROM chat_message t WHERE t.answers = o.id AND t.state = 'applied') AS taken
         FROM chat_message o JOIN chat_message a ON a.id = o.answers
        WHERE o.id = $1 AND o.workflow_id = $2 AND o.state = 'offered'`, [asked.data.messageId, workflowId]);
    if (!offer) return refuse('There is no such offer on this draft.');
    if (offer.taken) return refuse('That has already been added.');
    const { rows: [u] } = await db.query<{ status: string }>(
      `SELECT status FROM understanding WHERE workflow_id = $1 FOR UPDATE`, [workflowId]);
    if (u!.status !== 'sorted') return refuse(CHAT_REFUSALS.busy);

    // A rewording the chat proposed, taken up by the author: their act, so
    // the revision is theirs (Decision 17). Orbit never applies one unasked.
    if (offer.outcome?.offer === 'revise' && offer.outcome.sentence && offer.outcome.text) {
      await db.query('COMMIT');
      const revised = await reviseSentence(db, workflowId, { sentence: offer.outcome.sentence, text: offer.outcome.text }, 'chat');
      if (!revised.ok) return { ok: false, because: revised.because };
      const { rows: [done] } = await db.query<{ id: string }>(
        `INSERT INTO chat_message (workflow_id, said_by, text, state, outcome, answers)
         VALUES ($1, 'orbit', $2, 'applied', $3, $4) RETURNING id`,
        [workflowId, `${offer.outcome.sentence} now reads as you accepted. Press Map changes to map it.`,
         JSON.stringify({ sentence: offer.outcome.sentence, revised: true }), asked.data.messageId]);
      return { ok: true, id: done!.id, state: 'answered' };
    }

    const part = await insertPart(db, workflowId, { source: 'author', body: offer.text });
    if (!part.ok) return refuse(part.because);
    await db.query(
      `INSERT INTO sentence_label (sentence_id, label, reason, basis, given_by)
       SELECT s.id, 'forAPerson', 'Added from the chat as work for a person: it would change data.', 'stated', 'author'
         FROM procedure_sentence s JOIN procedure_part p ON p.id = s.part_id
        WHERE p.workflow_id = $1 AND p.key = $2`, [workflowId, part.key]);
    const { rows: [done] } = await db.query<{ id: string }>(
      `INSERT INTO chat_message (workflow_id, said_by, text, state, outcome, answers)
       VALUES ($1, 'orbit', $2, 'applied', $3, $4) RETURNING id`,
      [workflowId, `Added as part ${part.key}, for a person.`, JSON.stringify({ part: part.key, forAPerson: true }),
       asked.data.messageId]);
    // The tables are made again from the labels as they now stand, and a
    // confirmation no longer refers to this draft.
    await db.query(`UPDATE understanding SET status = 'queued', sorted_at = NULL, lease_expires_at = NULL,
                    claimed_by = NULL WHERE workflow_id = $1`, [workflowId]);
    await db.query(`UPDATE workflow SET confirmed_at = NULL, updated_at = now() WHERE id = $1`, [workflowId]);
    await db.query('COMMIT');
    return { ok: true, id: done!.id, state: 'answered' };
  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  }
}

export async function chatOf(db: ClientBase, workflowId: string) {
  const { rows } = await db.query<{
    id: string; said_by: 'author' | 'orbit'; text: string | null; state: string; outcome: unknown;
    answers: string | null; created_at: string;
  }>(`SELECT id, said_by, text, state, outcome, answers, created_at FROM chat_message
       WHERE workflow_id = $1 ORDER BY seq`, [workflowId]);
  return rows;
}
