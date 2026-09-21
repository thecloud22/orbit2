/**
 * Saying what a step does, without saying how to find it.
 *
 * An author can add a step and, until now, could not finish it: `editStep`
 * accepted any `declares` that parsed and no screen called it, so the only
 * outcome of adding one was a draft publication would refuse forever.
 *
 * What an author may supply is deliberately narrower than what a step holds.
 * Orbit derives a binding from its own view of the page — Decision 15 orders
 * the ladder by how often each rung is measurably wrong — so a binding typed
 * by a person is the single thing that ladder exists to prevent. The schemas
 * below carry no `binding`, no `strategy`, no `name` and no selector, and
 * `object()` is `z.strictObject`, so one arriving anyway is refused at the
 * boundary rather than ignored. The guarantee is the shape of the type, not a
 * check somebody has to remember.
 *
 * This is why only three kinds are here. `end`, `check` and `branch` are
 * decided entirely from what the draft already holds — a name, a comparison
 * over values earlier steps read, another step to go to. `read`, `enter` and
 * `activate` name something on a page, and until Orbit can show an author
 * what that page offers there is nothing honest for them to pick from. See
 * `docs/step-editing.md`.
 */
import type { PoolClient } from 'pg';
import { comparison, name, object, z, type Blocker } from '@orbit/contract';
import { editStep, type EditResult } from './edit.ts';

/**
 * A conclusion. `publishes` names values earlier steps produce; publication
 * checks that each is produced on *every* path that reaches here, which is a
 * stronger thing than the picker can know and is left to the gate.
 */
const anEnding = object({
  kind: z.literal('end'),
  summary: z.string().min(1).max(200),
  outcome: name,
  publishes: z.array(name).max(32),
});

/** An assertion that stops the run when it does not hold. */
const aCheck = object({
  kind: z.literal('check'),
  summary: z.string().min(1).max(200),
  that: comparison,
  otherwise: z.string().min(1).max(200),
});

/** Two ways on. Both targets are steps of this same workflow, checked below. */
const aBranch = object({
  kind: z.literal('branch'),
  summary: z.string().min(1).max(200),
  when: comparison,
  ifTrue: z.uuid(),
  ifFalse: z.uuid(),
});

export const configuration = z.discriminatedUnion('kind', [anEnding, aCheck, aBranch]);
export type Configuration = z.infer<typeof configuration>;

/** The kinds this can finish. The rest are absent for a reason, not hidden. */
export const CONFIGURABLE = ['end', 'check', 'branch'] as const;

export type ConfigureResult = EditResult;

export async function configureStep(
  db: PoolClient, workflowId: string, stepId: string, body: unknown,
): Promise<ConfigureResult> {
  const checked = configuration.safeParse(body);
  if (!checked.success) {
    return { ok: false, because: checked.error.issues
      .map((i) => `${i.path.join('.') || 'the step'}: ${i.message}`).join('; ') };
  }
  const given = checked.data;

  const { rows: [existing] } = await db.query<{ kind: string }>(
    `SELECT kind FROM workflow_step WHERE id = $1 AND workflow_id = $2`, [stepId, workflowId]);
  if (!existing) return { ok: false, because: 'There is no such step in this workflow.' };

  // A step's kind is fixed when it is made — `editStep` says why, and run
  // evidence cites steps by identity. Configuring one as a different kind
  // would be a different step wearing the same name.
  if (existing.kind !== given.kind) {
    return { ok: false, because: `This is a ${existing.kind} step, and a step's kind is fixed when it is added. `
      + 'Remove it and add one of the kind you want.' };
  }

  // A branch may only go to steps of this workflow. Sent elsewhere it would
  // publish — nothing in `checkForPublication` looks outside the list it is
  // given — and halt at run time with a target it cannot resolve.
  if (given.kind === 'branch') {
    const { rows: mine } = await db.query<{ id: string }>(
      `SELECT id FROM workflow_step WHERE workflow_id = $1`, [workflowId]);
    const here = new Set(mine.map((r) => r.id));
    const astray = [given.ifTrue, given.ifFalse].filter((t) => !here.has(t));
    if (astray.length > 0) {
      return { ok: false, because: 'A branch can only go to a step of this same agent.' };
    }
    if (given.ifTrue === given.ifFalse) {
      return { ok: false, because: 'Both ways lead to the same step, so nothing is being decided. '
        + 'Send them to different steps, or remove the branch.' };
    }
  }

  const { kind: _kind, ...declares } = given;
  return editStep(db, workflowId, stepId, declares as Record<string, unknown>);
}

export type { Blocker };
