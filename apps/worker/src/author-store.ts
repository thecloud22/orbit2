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
import { readCredential } from '@orbit/credentials';
import { authorFromProcedure, type AuthoredDraft, type Turn } from './author.ts';

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
  /** Draft into this workflow rather than making one: it was made when the
   *  procedure was brought in to be understood (Orbit 2.1). */
  into?: string;
  /** The confirmed sentences, numbered, for a walk after a sort. */
  sentences?: ReadonlyArray<{ number: string; text: string; waits?: boolean }>;
  mayBeAbsentAfter?: readonly string[];
  tables?: readonly import('@orbit/contract').RuleTable[];
  order?: readonly string[];
  model: ModelProvider;
  /** Each turn as it lands, for whoever is watching the screen. */
  onTurn?: (turn: Turn) => void;
}): Promise<Stored | NotStored> {
  // The sign-in the registry holds: what the application calls its password,
  // and the account it signs in as. Both so a sign-in step can refer to what
  // exists rather than to something invented here — and so the account never
  // becomes a value somebody is asked for when they start a run.
  const { rows: [registered] } = await db.query<{ credential_name: string | null; sign_in_as: string | null }>(
    `SELECT r.credential_name, r.sign_in_as FROM application_revision r
      WHERE r.application_id = $1 ORDER BY r.revision DESC LIMIT 1`, [opts.applicationId]);

  // The password itself, for the walk to type into the page and for nothing
  // else. A written procedure begins by signing in, and a walk that cannot
  // sign in maps the rest of the procedure against the login page. It is read
  // here rather than inside the walk so that the one place a credential is
  // decrypted stays a query in a file that already talks to the store, and it
  // is never passed on: `storeDraft` receives the draft, not the options.
  const signsInWith = registered?.credential_name
    ? await readCredential(db as never, registered.credential_name).catch(() => null)
    : null;

  return storeDraft(db, opts, await authorFromProcedure({ ...opts,
    ...(opts.onTurn ? { onTurn: opts.onTurn } : {}),
    credentialName: registered?.credential_name ?? null,
    signsInAs: registered?.sign_in_as ?? null,
    signsInWith }));
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
  opts: { name: string; procedure: string | null; into?: string },
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
    // Into the draft that was made when the procedure was brought in, whose
    // procedure column already holds the whole text as written. The walk was
    // given only the sentences Orbit does, and that is not what the author
    // wrote, so it does not replace it.
    const workflowId = opts.into
      ? (await db.query<{ id: string }>(
          `UPDATE workflow SET declared_inputs = $2, updated_at = now() WHERE id = $1 RETURNING id`,
          [opts.into, JSON.stringify(draft.declaredInputs)])).rows[0]?.id
      : (await db.query<{ id: string }>(
          `INSERT INTO workflow (name, procedure, declared_inputs) VALUES ($1, $2, $3) RETURNING id`,
          [opts.name, opts.procedure, JSON.stringify(draft.declaredInputs)])).rows[0]?.id;
    if (!workflowId) throw new Error(`there is no draft ${opts.into} to write into`);
    // The sort's calls are already on this draft; the walk's are numbered after them.
    const { rows: [before] } = await db.query<{ turn: number }>(
      `SELECT coalesce(max(turn), 0)::int AS turn FROM model_call WHERE workflow_id = $1`, [workflowId]);
    const offset = before!.turn;

    // Steps carry stable ids so that references survive the reordering §6
    // permits; position is only what the editor shows.
    for (const [i, step] of draft.steps.entries()) {
      const { id, kind, ...declares } = step;
      await db.query(
        `INSERT INTO workflow_step (id, workflow_id, position, kind, declares, complete, from_sentence)
         VALUES ($1, $2, $3, $4, $5, true, $6)`,
        [id, workflowId, i + 1, kind, JSON.stringify(declares), draft.provenance?.[id] ?? null]);
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
      // A note Orbit has already answered is settled when it is written. It
      // is on the record and it blocks nothing — the difference between
      // saying what was assumed and demanding that somebody type it back.
      await db.query(
        note.answer
          ? `INSERT INTO workflow_note (workflow_id, kind, body, answer, resolved_at)
             VALUES ($1, $2, $3, $4, now())`
          : `INSERT INTO workflow_note (workflow_id, kind, body, answer) VALUES ($1, $2, $3, $4)`,
        [workflowId, note.kind, note.body, note.answer ?? null]);
    }

    for (const turn of draft.turns) {
      await db.query(
        `INSERT INTO model_call
           (workflow_id, turn, provider, model, shown, answered, verdict, why, tokens_in, tokens_out,
            tokens_cached, tokens_cache_written, cost_micros)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
        [workflowId, offset + turn.turn, turn.provider, turn.model,
         JSON.stringify(turn.shown), turn.answered ? JSON.stringify(turn.answered) : null,
         turn.verdict, turn.why, turn.tokensIn, turn.tokensOut,
         turn.tokensCached, turn.tokensCacheWritten, turn.costMicros]);
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
