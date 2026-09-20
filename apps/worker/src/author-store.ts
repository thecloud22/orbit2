/**
 * An authoring session, stored.
 *
 * §12 asks that where a model was involved in authoring, every call is
 * recorded with what it was asked, what it returned, what it cost, and what it
 * was looking at — **including calls that produced nothing usable**. Decision 6
 * constraint 3 puts it more bluntly: a session whose turns were not recorded
 * produces a workflow nobody can review the origin of, and the provenance
 * record is the deliverable as much as the workflow is.
 *
 * So the draft and its turns land in one transaction. A draft without its
 * reasoning is not half a result; it is a result nobody can check.
 */
import type { PoolClient } from 'pg';
import type { ModelProvider } from '@orbit/model';
import { authorFromProcedure, type AuthoredDraft } from './author.ts';

export interface Stored { workflowId: string; draft: AuthoredDraft }

export async function authorAndStore(db: PoolClient, opts: {
  name: string;
  procedure: string;
  applicationId: string;
  origin: string;
  startPath: string;
  inputs: Record<string, string>;
  model: ModelProvider;
}): Promise<Stored> {
  const draft = await authorFromProcedure(opts);

  await db.query('BEGIN');
  try {
    const { rows: [workflow] } = await db.query<{ id: string }>(
      `INSERT INTO workflow (name, procedure) VALUES ($1, $2) RETURNING id`,
      [opts.name, opts.procedure]);
    const workflowId = workflow!.id;

    // Steps carry stable ids so that references survive the reordering §6
    // permits; position is only what the editor shows.
    for (const [i, step] of draft.steps.entries()) {
      const { id, kind, ...declares } = step;
      await db.query(
        `INSERT INTO workflow_step (id, workflow_id, position, kind, declares, complete)
         VALUES ($1, $2, $3, $4, $5, true)`,
        [id, workflowId, i + 1, kind, JSON.stringify(declares)]);
    }
    for (const [i, step] of draft.steps.entries()) {
      const next = draft.steps[i + 1];
      if (next && step.kind !== 'end') {
        await db.query(`UPDATE workflow_step SET next_step = $2 WHERE id = $1`, [step.id, next.id]);
      }
    }

    // What the model could not work out. §4 and acceptance criterion 3: any
    // outstanding one blocks confirmation, with a link to it.
    for (const question of draft.questions) {
      await db.query(
        `INSERT INTO workflow_note (workflow_id, kind, body) VALUES ($1, 'question', $2)`,
        [workflowId, question]);
    }

    for (const turn of draft.turns) {
      await db.query(
        `INSERT INTO model_call
           (workflow_id, turn, provider, model, shown, answered, verdict, why, tokens_in, tokens_out, cost_micros)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [workflowId, turn.turn, turn.provider, turn.model,
         JSON.stringify(turn.shown), turn.answered ? JSON.stringify(turn.answered) : null,
         turn.verdict, turn.why, turn.tokensIn, turn.tokensOut, turn.costMicros]);
    }

    await db.query(
      `INSERT INTO audit_entry (act, object_kind, object_id, changed)
       VALUES ('procedure brought in', 'workflow', $1, $2)`,
      [workflowId, JSON.stringify({
        turns: draft.turns.length,
        producedNothing: draft.turns.filter((t) => t.verdict !== 'kept').length,
        model: draft.turns[0]?.model ?? null,
      })]);

    await db.query('COMMIT');
    return { workflowId, draft };
  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  }
}
