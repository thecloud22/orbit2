/**
 * Answering a question on the page (Decision 17 item 4, procedure editor
 * R6, R19). A question is left under its sentence with the picture of the
 * page Orbit was looking at; answering it is an edit, not only a record:
 *
 *   pickElement  — the author says which thing on that page the sentence
 *                  means, or that it is not on the page. Kept as the answer,
 *                  and handed to the next mapping of that sentence as the
 *                  author's word. The request carries a name the page offered,
 *                  never a binding: Orbit still has to find it there, exactly
 *                  (Decision 12), when it maps again.
 *   useInput     — the fixed value becomes an input with it as the example.
 *   giveExample  — the input gets the example a test run and the next mapping use.
 *   mapAgain     — the author says what does it, in words, for the next mapping.
 *
 * Any answer lapses a confirmation, since it changes what was attested to.
 */
import type { PoolClient } from 'pg';
import { object, z } from '@orbit/contract';
import { returnToDraft } from './edit.ts';
import { declareInput, setStepValue } from './values.ts';

export type Answered = { ok: true } | { ok: false; because: string };

export const answerAsked = object({
  noteId: z.uuid(),
  /** A name from the question's own candidates, exactly as it was offered. */
  candidate: z.string().max(300).optional(),
  notOnPage: z.boolean().optional(),
  /** Words, for a question Orbit cannot act on by itself. */
  answer: z.string().trim().max(2000).optional(),
  example: z.string().max(4096).optional(),
});

/** A camelCase name from a label: "Loan number" is `loanNumber`. */
const nameFrom = (label: string) => label.trim().replace(/[^A-Za-z0-9 ]+/g, ' ').split(/\s+/).filter(Boolean)
  .map((w, i) => (i === 0 ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())).join('').replace(/^[^a-z]+/, '');

export async function answerQuestion(db: PoolClient, workflowId: string, body: unknown): Promise<Answered> {
  const asked = answerAsked.safeParse(body);
  if (!asked.success) return { ok: false, because: 'Say which question, and what the answer is.' };
  const a = asked.data;
  const { rows: [note] } = await db.query<{
    id: string; kind: string; body: string; resolved_at: string | null; sentence: string | null;
    step_id: string | null; action: string | null; candidates: Array<{ name: string; what: string; label?: string }> | null;
  }>(`SELECT id, kind, body, resolved_at, sentence, step_id, action, candidates FROM workflow_note
       WHERE id = $1 AND workflow_id = $2`, [a.noteId, workflowId]);
  if (!note) return { ok: false, because: 'There is no such question on this draft.' };
  if (note.resolved_at) return { ok: false, because: 'That question has already been answered.' };

  let said: string;
  if (note.action === 'pickElement') {
    if (a.notOnPage) said = 'It is not on this page.';
    else if (a.candidate && (note.candidates ?? []).some((c) => c.name === a.candidate)) said = `It is “${a.candidate}”.`;
    else if (a.answer) said = a.answer;
    else return { ok: false, because: 'Pick one of the things on the page, say it is not there, or say what it is.' };
  } else if (note.action === 'useInput') {
    if (!note.step_id) return { ok: false, because: 'The step this question was about is no longer in the draft.' };
    const { rows: [step] } = await db.query<{ declares: { into?: { label?: string }; value?: { from?: string; literal?: { text?: string } } } }>(
      `SELECT declares FROM workflow_step WHERE id = $1`, [note.step_id]);
    if (!step) return { ok: false, because: 'The step this question was about is no longer in the draft.' };
    if (step.declares.value?.from === 'literal') {
      const label = step.declares.into?.label ?? 'Value';
      const name = nameFrom(label) || 'value';
      const { rows: [w] } = await db.query<{ inputs: Array<{ name: string }> }>(
        `SELECT coalesce(declared_inputs, '[]'::jsonb) AS inputs FROM workflow WHERE id = $1`, [workflowId]);
      if (!w?.inputs.some((i) => i.name === name)) {
        const declared = await declareInput(db, workflowId, { name, label, example: step.declares.value.literal?.text ?? '' });
        if (!declared.ok) return declared;
      }
      const set = await setStepValue(db, workflowId, { stepId: note.step_id, value: { from: 'input', value: name } });
      if (!set.ok) return set;
      said = `Made it an input, ${name}.`;
    } else {
      said = 'It is already given when the run starts.';
    }
  } else if (note.action === 'giveExample') {
    const input = note.candidates?.[0]?.name;
    if (!a.example?.trim() || !input) return { ok: false, because: 'Give the example value.' };
    await db.query(`UPDATE understanding SET inputs = inputs || $2::jsonb WHERE workflow_id = $1`,
      [workflowId, JSON.stringify({ [input]: a.example.trim() })]);
    said = `The example for ${input} is ${a.example.trim()}.`;
  } else {
    if (!a.answer) return { ok: false, because: 'Say what the answer is.' };
    said = a.answer;
  }

  await db.query(`UPDATE workflow_note SET answer = $2, resolved_at = now() WHERE id = $1`, [note.id, said]);
  await returnToDraft(db, workflowId, 'A question was answered');
  await db.query(`INSERT INTO audit_entry (act, object_kind, object_id, changed) VALUES ('question answered', 'workflow', $1, $2)`,
    [workflowId, JSON.stringify({ note: note.id, sentence: note.sentence, answer: said })]);
  return { ok: true };
}
