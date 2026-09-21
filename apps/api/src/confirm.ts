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
import { object, z, type Blocker, describeBlocker } from '@orbit/contract';

/**
 * Declared rather than asserted, because a request body is a boundary.
 *
 * It was taken on trust and cast, so a request missing `answers` reached
 * `c.answers.map` and came back as a raw TypeError — an internal fault where a
 * refusal belonged. Persistence is validated on the way out of the store for
 * exactly this reason; an HTTP body has travelled further and deserves it more.
 */
export const confirmation = object({
  /** Which step ends which way, and what that conclusion is called. */
  endings: z.array(object({
    stepId: z.uuid(),
    outcome: z.string().min(1).max(120),
    label: z.string().min(1).max(120),
    example: z.record(z.string(), z.string()),
  })).max(64),
  /** Answers to the questions Orbit raised. Every one must be answered, and
   *  an answer is something somebody said — a note id on its own closes a
   *  question without settling it. */
  answers: z.array(object({
    noteId: z.uuid(),
    /**
     * What settles it, in the author's own words.
     *
     * Blank for a risk, which §4 settles by acknowledgement rather than by an
     * answer: "answer the questions, confirm the assumptions, decide the
     * exceptions, acknowledge the risks". A caution raised by the recorder —
     * that a demonstration shows one path — has no answer, and demanding one
     * meant the author typed something meaningless to get past a warning that
     * typing cannot address.
     */
    answer: z.string().max(2000).transform((a) => a.trim()),
    /** Set where there was nothing to answer and something to have seen. */
    acknowledged: z.boolean().default(false),
  })).max(256),
  attested: z.boolean(),
});
export type Confirmation = z.infer<typeof confirmation>;

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
  // A question needs words; a risk needs somebody to have seen it. Both are
  // settled acts and both are recorded — what differs is what counts as one.
  const settled = new Map(c.answers.map((a) => [a.noteId, a]));
  for (const note of notes) {
    const given = settled.get(note.id);
    const enough = note.kind === 'risk'
      ? Boolean(given?.acknowledged || given?.answer)
      : Boolean(given?.answer);
    if (!enough) {
      blockers.push({ kind: 'outstanding', note: note.kind as 'question', body: note.body });
    }
  }

  // §4: confirmation attests that this is the procedure, and a procedure that
  // reaches no conclusion is not one. Caught here as well as at publication,
  // because attesting to it is the act that would carry a person's name.
  const { rows: [ends] } = await db.query<{ n: string }>(
    `SELECT count(*) AS n FROM workflow_step WHERE workflow_id = $1 AND kind = 'end'`, [workflowId]);
  if (Number(ends?.n ?? 0) === 0) blockers.push({ kind: 'workflowHasNoEnding' });

  // Activation is gated on proving every ending with a real run, and those runs
  // use these values — so an ending with no example is one nothing could ever
  // prove. But that is only true where the workflow asks for something. A
  // procedure that names the record it works on needs no input, a run of it
  // needs no values, and demanding an example anyway made such a workflow
  // impossible to confirm at all: the screen had nothing to ask for, and the
  // gate refused what it sent.
  const { rows: [declared] } = await db.query<{ inputs: Array<{ name: string; required: boolean }> }>(
    `SELECT coalesce(declared_inputs, '[]'::jsonb) AS inputs FROM workflow WHERE id = $1`, [workflowId]);
  const wanted = (declared?.inputs ?? []).filter((i) => i.required).map((i) => i.name);

  for (const ending of c.endings) {
    const missing = wanted.filter((name) => !String(ending.example[name] ?? '').trim());
    if (missing.length > 0) {
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
      // Resolved and answered are set together, and the schema will not accept
      // one without the other. What was decided is the part worth keeping —
      // the timestamp only says a question stopped being asked.
      await db.query(
        `UPDATE workflow_note SET resolved_at = now(), answer = $2 WHERE id = $1 AND workflow_id = $3`,
        // A risk acknowledged without words still records that it was seen,
        // because the column is what proves the act happened.
        [answer.noteId, answer.answer || 'Acknowledged.', workflowId]);
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
