/**
 * The sort confirmed, and the walk queued (Orbit 2.1; drafted straight
 * through in 2.6, docs/plans/2026-09-23-start-on-the-editor.md).
 *
 * One routine for both hands that confirm: the author, pressing "Draft it"
 * on a procedure they wrote by hand, and Orbit, when a procedure arrived whole
 * — pasted, or read from a PDF — and has just been sorted (E5). The record
 * says which. The caller holds the transaction.
 *
 * It stops, and says why in words a person can act on, in two cases only
 * (E6): the author said more is to come, or nothing in the procedure is
 * Orbit's to do. What the sort page used to hold drafting back for is raised
 * after it instead (E7): a line that reads like instructions is a risk on its
 * sentence; a sentence for a person is asked whether the run waits there; and
 * a rule comparing something no step reads is a question on that rule,
 * derived from the tables each time it is shown, and its table left out of
 * the walk until it can be decided.
 */
import type { ClientBase } from 'pg';
import { forTheWalk, sentencesWithLabels } from './sentences.ts';

export type Drafted =
  | { ok: true; id: string }
  /** `stop`: one of the two places drafting stops on purpose, said as a reason (E6). */
  | { ok: false; because: string; stop?: true };

export const MORE_TO_COME = 'Not drafted yet: you said more of the procedure is to come. Add the rest, or say that is all of it, '
  + 'and Orbit drafts the whole procedure at once.';
export const NOTHING_FOR_ORBIT = 'Nothing to draft: none of these sentences is something Orbit does. They are background, '
  + 'rules, or work for a person. If Orbit should do one of them, change what it is.';

/** The question asked of a sentence for a person, after drafting (E7). */
export const waitQuestion = (number: string, text: string) =>
  `${number} is work for a person ("${text.slice(0, 300).replace(/[.!?]+$/, '')}"). Does the run wait here until they have done it, `
  + 'or carry on without them?';

export async function draftFromSort(db: ClientBase, workflowId: string, by: 'author' | 'orbit'): Promise<Drafted> {
  const { rows: [u] } = await db.query<{
    status: string; confirmed_at: string | null; application_id: string; start_path: string;
    inputs: Record<string, string>; name: string; more_to_come: boolean;
  }>(`SELECT u.status, u.confirmed_at, u.application_id, u.start_path, u.inputs, u.more_to_come, w.name
        FROM understanding u JOIN workflow w ON w.id = u.workflow_id
       WHERE u.workflow_id = $1 FOR UPDATE OF u`, [workflowId]);
  if (!u) return { ok: false, because: 'This draft was not brought in to be understood.' };
  if (u.confirmed_at) return { ok: false, because: 'This has already been drafted.' };
  if (u.status !== 'sorted') return { ok: false, because: 'Orbit has not finished sorting this yet.' };
  if (u.more_to_come) return { ok: false, because: MORE_TO_COME, stop: true };

  const sentences = (await sentencesWithLabels(db, workflowId)).filter((s) => !s.withdrawn);
  if (!sentences.length) return { ok: false, because: 'Write the procedure first.' };
  const unplaced = sentences.filter((s) => !s.label).map((s) => s.number);
  if (unplaced.length) {
    return { ok: false, because: `${unplaced.length === 1 ? 'Sentence' : 'Sentences'} ${unplaced.join(', ')} `
      + `${unplaced.length === 1 ? 'has' : 'have'} no label yet. Every sentence is placed before anything is drafted.` };
  }
  const procedure = forTheWalk(sentences);
  if (!procedure) return { ok: false, because: NOTHING_FOR_ORBIT, stop: true };

  const { rows: [session] } = await db.query<{ id: string }>(
    `INSERT INTO authoring_session (name, procedure, application_id, start_path, inputs, into_workflow_id)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [u.name, procedure, u.application_id, u.start_path, JSON.stringify(u.inputs), workflowId]);

  // A sentence that reads like instructions to a machine is a risk somebody
  // acknowledges before this is published: it may be a document written to
  // steer Orbit rather than a procedure for a person. Left on its sentence.
  for (const s of sentences.filter((x) => x.suspicious)) {
    await db.query(
      `INSERT INTO workflow_note (workflow_id, kind, body, sentence) VALUES ($1, 'risk', $2, $3)`,
      [workflowId, `Sentence ${s.number} ("${s.text.slice(0, 300)}"): ${s.suspicious}. Orbit treated it as text and `
        + 'did not follow it. Check the draft does only what the procedure asks.', s.number]);
  }
  // Work for a person: whether the run waits there was a tick on the sort
  // page, before anything was drafted. Now it is asked, on the sentence.
  for (const s of sentences.filter((x) => x.label === 'forAPerson' && !x.waits && !x.suspicious)) {
    await db.query(
      `INSERT INTO workflow_note (workflow_id, kind, body, sentence, action) VALUES ($1, 'question', $2, $3, 'waitHere')`,
      [workflowId, waitQuestion(s.number, s.text), s.number]);
  }
  for (const s of sentences.filter((x) => x.label === 'wontDo')) {
    await db.query(
      `INSERT INTO workflow_note (workflow_id, kind, body, answer, resolved_at)
       VALUES ($1, 'assumption', $2, 'Orbit will not do this, as the procedure says.', now())`,
      [workflowId, `Sentence ${s.number}: "${s.text}"`]);
  }

  await db.query(
    `UPDATE understanding SET confirmed_at = now(), session_id = $2, not_drafted = NULL WHERE workflow_id = $1`,
    [workflowId, session!.id]);
  await db.query(
    `INSERT INTO audit_entry (act, object_kind, object_id, changed)
     VALUES ('understanding confirmed', 'workflow', $1, $2)`,
    [workflowId, JSON.stringify({
      by,
      sentences: sentences.length,
      forTheWalk: sentences.filter((s) => s.label === 'task' || s.label === 'rule').length,
    })]);
  return { ok: true, id: session!.id };
}

/**
 * Orbit drafts a procedure that arrived whole, as soon as it is sorted (E5),
 * or says why it did not (E6). Called by the worker after a sort; its own
 * transaction, so a refusal leaves nothing half-written.
 */
export async function draftWhenSorted(db: ClientBase, workflowId: string): Promise<Drafted | null> {
  const { rows: [u] } = await db.query<{ draft_when_sorted: boolean; confirmed_at: string | null }>(
    `SELECT draft_when_sorted, confirmed_at FROM understanding WHERE workflow_id = $1`, [workflowId]);
  if (!u?.draft_when_sorted || u.confirmed_at) return null;
  await db.query('BEGIN');
  try {
    const drafted = await draftFromSort(db, workflowId, 'orbit');
    if (drafted.ok) {
      await db.query('COMMIT');
      return drafted;
    }
    await db.query('ROLLBACK');
    await db.query(`UPDATE understanding SET not_drafted = $2 WHERE workflow_id = $1`, [workflowId, drafted.because]);
    return drafted;
  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  }
}
