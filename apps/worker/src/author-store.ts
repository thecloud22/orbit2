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
import { step as stepSchema } from '@orbit/contract';
import type { ModelProvider } from '@orbit/model';
import { authorFromProcedure, type AuthoredDraft } from './author.ts';

export interface Stored { stored: true; workflowId: string; draft: AuthoredDraft }

/**
 * What an interpretation that did not survive validation leaves behind.
 *
 * Acceptance criterion 2: "An interpretation that fails validation stores
 * **nothing** — not the valid parts — and says so." The emphasis is the whole
 * requirement. Keeping the steps that happened to validate would hand someone
 * a procedure with a hole in the middle and no marker where the hole is, which
 * is worse than handing them nothing: they would be reviewing a workflow that
 * never existed as a reading of their text.
 */
export interface NotStored {
  stored: false;
  /** Which step of the interpretation, and what was wrong with it. */
  problems: Array<{ step: number; kind: string; wrong: string[] }>;
  /** The turns, returned rather than recorded — there is no workflow row for
   *  them to hang from, and inventing one to hold them would be storing part
   *  of a result that was refused. Said out loud because §12 does want failed
   *  calls kept, and slice 1 cannot keep these. */
  turns: AuthoredDraft['turns'];
  describe: string;
}

export async function authorAndStore(db: PoolClient, opts: {
  name: string;
  procedure: string;
  applicationId: string;
  origin: string;
  startPath: string;
  inputs: Record<string, string>;
  model: ModelProvider;
}): Promise<Stored | NotStored> {
  return storeDraft(db, opts, await authorFromProcedure(opts));
}

/**
 * Stores an interpretation, or refuses the whole of it.
 *
 * Kept apart from producing one so that the rule about what may be stored can
 * be tested against a draft the test chose, rather than against whatever a
 * model happened to say that day. The two were welded together, and a rule
 * nobody can exercise is a rule nobody can rely on.
 */
/**
 * What was wrong with a step, for the person who wrote the procedure.
 *
 * A schema message is written for whoever wrote the schema. "value.value:
 * starts with a lower-case letter, then letters and digits" describes a field
 * path in a discriminated union to somebody who wrote a sentence about a loan
 * file — true, precise, and nothing they can act on.
 *
 * So the field is named in the terms the product uses everywhere else, and the
 * schema's own wording is dropped rather than appended. Keeping it would be
 * more accurate and less useful: the author cannot tell "expected object,
 * received undefined" from a bug in Orbit, which is exactly the doubt a
 * refusal is supposed to remove.
 */
const PLAINLY: Record<string, string> = {
  value: 'Orbit could not work out what goes into that field',
  into: 'Orbit could not work out what on the page this acts on',
  control: 'Orbit could not work out what on the page this acts on',
  region: 'Orbit could not work out what on the page this acts on',
  table: 'Orbit could not work out which table on the page this reads',
  then: 'it does not say what should be true once this has been done',
  arrives: 'it does not say what should be true once the page has opened',
  changesARecord: 'it does not say whether doing this commits anything',
  outcome: 'it has no name for the conclusion it reaches',
  produces: 'it does not say what the value it reads is called',
  publishes: 'it does not say which values the conclusion carries',
  path: 'it does not say where to go',
  application: 'it does not say which system this happens in',
  when: 'it does not say what is being compared',
  that: 'it does not say what is being checked',
  otherwise: 'it does not say what happens when the check does not hold',
  sensitive: 'it does not say whether what goes in is a secret',
};

function inWords(issue: { path: PropertyKey[]; message: string }): string {
  const field = String(issue.path[0] ?? '');
  return PLAINLY[field] ?? (field
    ? `Orbit did not work out its ${field}`
    : 'it is not a shape Orbit can carry out');
}

export async function storeDraft(
  db: PoolClient,
  /** A recording has no written procedure: the demonstration is the description. */
  opts: { name: string; procedure: string | null },
  draft: AuthoredDraft,
): Promise<Stored | NotStored> {
  // Validated before anything is written, and as a whole. Validating inside
  // the transaction would work too, but it would mean the check that decides
  // whether to store lives next to the storing — and the requirement is about
  // the interpretation, not about the database.
  const problems = draft.steps.flatMap((step, i) => {
    const checked = stepSchema.safeParse(step);
    return checked.success ? [] : [{
      step: i + 1,
      kind: step.kind,
      wrong: [...new Set(checked.error.issues.map(inWords))],
    }];
  });
  if (problems.length > 0) {
    return { stored: false, problems, turns: draft.turns,
      describe: `This reading of the procedure did not hold together, so none of it was kept. `
        + problems.map((p) => `The ${p.kind} at step ${p.step}: ${p.wrong.join('; ')}.`).join(' ') };
  }

  await db.query('BEGIN');
  try {
    const { rows: [workflow] } = await db.query<{ id: string }>(
      `INSERT INTO workflow (name, procedure, declared_inputs) VALUES ($1, $2, $3) RETURNING id`,
      [opts.name, opts.procedure, JSON.stringify(draft.declaredInputs)]);
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
    for (const note of draft.questions) {
      await db.query(
        `INSERT INTO workflow_note (workflow_id, kind, body) VALUES ($1, $2, $3)`,
        [workflowId, note.kind, note.body]);
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
    return { stored: true, workflowId, draft };
  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  }
}
