/**
 * Confirming the process.
 *
 * §4 phase three: attest that this is the procedure, and give an example of
 * the values that reach each way it can end. It is a deliberate human act —
 * nothing here may be done by an automated part of Orbit, because "nothing
 * advances a workflow on its own, and no automated part of Orbit may move a
 * workflow closer to being live".
 *
 * Confirmation fixes the procedure. Editing a step afterwards returns the
 * workflow to draft, and it is confirmed again — which is why `confirmed_at`
 * is cleared by an edit rather than kept.
 */
import type { PoolClient } from 'pg';
import { type Blocker, describeBlocker } from '@orbit/contract';

export interface Confirmation {
  /** Which step ends which way, and what that conclusion is called. */
  endings: Array<{ stepId: string; outcome: string; label: string; example: Record<string, string> }>;
  /** Answers to the questions Orbit raised. Every one must be answered. */
  answers: Array<{ noteId: string }>;
  attested: boolean;
}

export type ConfirmResult =
  | { outcome: 'confirmed'; outcomes: number }
  | { outcome: 'refused'; blockers: Blocker[] };

export async function confirm(db: PoolClient, workflowId: string, c: Confirmation): Promise<ConfirmResult> {
  const blockers: Blocker[] = [];

  if (!c.attested) {
    blockers.push({ kind: 'outstanding', note: 'assumption',
      body: 'Nobody has attested that this is the procedure. Confirmation is an act, not a state.' });
  }

  const { rows: notes } = await db.query<{ id: string; kind: string; body: string }>(
    `SELECT id, kind, body FROM workflow_note WHERE workflow_id = $1 AND resolved_at IS NULL`, [workflowId]);
  const answered = new Set(c.answers.map((a) => a.noteId));
  for (const note of notes) {
    if (!answered.has(note.id)) {
      blockers.push({ kind: 'outstanding', note: note.kind as 'question', body: note.body });
    }
  }

  for (const ending of c.endings) {
    if (Object.keys(ending.example).length === 0) {
      // Activation is gated on proving every ending with a real run, and those
      // runs use these values. An ending with no example is one nothing could
      // ever prove.
      blockers.push({ kind: 'endingHasNoExample', outcome: ending.outcome });
    }
  }

  if (blockers.length > 0) return { outcome: 'refused', blockers };

  await db.query('BEGIN');
  try {
    for (const ending of c.endings) {
      await db.query(
        `UPDATE workflow_step
            SET declares = jsonb_set(declares, '{outcome}', to_jsonb($2::text)),
                complete = true
          WHERE id = $1 AND workflow_id = $3`,
        [ending.stepId, ending.outcome, workflowId]);
    }
    for (const answer of c.answers) {
      await db.query(`UPDATE workflow_note SET resolved_at = now() WHERE id = $1`, [answer.noteId]);
    }
    await db.query(
      `UPDATE workflow
          SET outcomes = $2, examples = $3, confirmed_at = now(), updated_at = now()
        WHERE id = $1`,
      [workflowId,
       JSON.stringify(c.endings.map((e) => ({ name: e.outcome, label: e.label }))),
       JSON.stringify(Object.fromEntries(c.endings.map((e) => [e.outcome, e.example])))]);

    await db.query(
      `INSERT INTO audit_entry (act, object_kind, object_id, changed)
       VALUES ('procedure confirmed', 'workflow', $1, $2)`,
      [workflowId, JSON.stringify({ endings: c.endings.map((e) => e.outcome) })]);

    await db.query('COMMIT');
    return { outcome: 'confirmed', outcomes: c.endings.length };
  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  }
}

export { describeBlocker };
