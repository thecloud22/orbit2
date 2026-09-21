/**
 * Correcting a draft.
 *
 * §6: reorder, insert, edit and delete, each validated on save. Three of those
 * carry a refusal that is easy to leave out and expensive to find later:
 *
 *   A reorder that would break a dependency is refused with the reason — a
 *   step cannot be moved above the step that produces the value it uses.
 *
 *   A deletion is refused where removing the step would leave a path with no
 *   ending, or would strand a value a later step needs.
 *
 *   An inserted step is incomplete until configured, and blocks publication
 *   until it is. It is not a silent no-op.
 *
 * And §4: editing a confirmed workflow returns it to draft. Confirmation is an
 * attestation about a particular set of steps; changing them without asking
 * again would make the attestation refer to something nobody attested to.
 */
import type { PoolClient } from 'pg';
import { describeBlocker, step as stepSchema, type Blocker, type Step } from '@orbit/contract';
import { asDraftStep, checkForPublication, type DraftStep } from './publish.ts';

export type EditResult = { ok: true } | { ok: false; because: string };

/** Reads a draft as it is, half-written steps included. */
async function stepsOf(db: PoolClient, workflowId: string): Promise<DraftStep[]> {
  const { rows } = await db.query<{ id: string; kind: string; declares: Record<string, unknown> }>(
    `SELECT id, kind, declares FROM workflow_step WHERE workflow_id = $1 ORDER BY position`, [workflowId]);
  return rows.map(asDraftStep);
}

/** Confirmation refers to a particular set of steps. Change them and it lapses. */
async function returnToDraft(db: PoolClient, workflowId: string, what: string): Promise<void> {
  const { rows: [w] } = await db.query<{ confirmed_at: string | null }>(
    `UPDATE workflow SET updated_at = now(),
            confirmed_at = NULL
      WHERE id = $1 RETURNING (SELECT confirmed_at FROM workflow WHERE id = $1) AS confirmed_at`, [workflowId]);
  if (w?.confirmed_at) {
    await db.query(
      `INSERT INTO audit_entry (act, object_kind, object_id, changed, reason)
       VALUES ('returned to draft', 'workflow', $1, '{}', $2)`,
      [workflowId, `${what} after confirmation, so the attestation no longer refers to these steps`]);
  }
}

/**
 * Would this arrangement of steps still hold together? Reuses the publication
 * checker rather than a second, quietly different set of rules — one place
 * decides what a valid workflow is.
 */
type Breakage = Extract<Blocker, { kind: 'valueNotProduced' | 'pathReachesNoEnding' | 'stepUnreachable' }>;

/** Every consequence, not the first — the same reason publication reports
 *  every blocker. The wording comes from the contract so the editor and the
 *  publish panel cannot drift into describing one problem two ways. */
function why(action: string, broken: Breakage[]): string {
  return `${action} would break this workflow. ${broken.map(describeBlocker).join(' ')}`;
}

/**
 * Refuses an edit that makes the draft worse, not one that leaves it imperfect.
 *
 * The difference matters more than it looks. A draft is routinely broken while
 * it is being written — a step inserted but not configured, an ending not yet
 * moved into place. Judging each edit against "is the result flawless" means a
 * draft that is broken for any reason cannot be edited at all, including by
 * the very edit that would fix it. The author is then trapped in the state
 * they were trying to leave, which is the worst thing an editor can do.
 *
 * So the gate is the count of breakages: an edit may leave the draft as broken
 * as it found it, and may improve it, but may not add to the damage.
 * Publication is the gate that insists on none, and it is unmoved by this.
 */
function madeWorse(before: Breakage[], after: Breakage[]): Breakage[] | null {
  return after.length > before.length ? after : null;
}

function wouldBreak(steps: DraftStep[], outcomes: string[]): Breakage[] {
  return checkForPublication(steps, { inputs: [], outcomes, examples: {} })
    // Incompleteness and missing examples are expected mid-edit. What is not
    // acceptable is a reference that can no longer resolve, or a path that
    // now leads nowhere.
    .filter((b): b is Breakage => b.kind === 'valueNotProduced' || b.kind === 'pathReachesNoEnding'
      || b.kind === 'stepUnreachable');
}

export async function moveStep(db: PoolClient, workflowId: string, stepId: string, to: number): Promise<EditResult> {
  const steps = await stepsOf(db, workflowId);
  const from = steps.findIndex((s) => s.id === stepId);
  if (from === -1) return { ok: false, because: 'There is no such step in this workflow.' };
  if (to < 1 || to > steps.length) return { ok: false, because: `There is no position ${to}.` };

  const reordered = [...steps];
  const [moved] = reordered.splice(from, 1);
  reordered.splice(to - 1, 0, moved!);

  const { rows: [w] } = await db.query<{ outcomes: Array<{ name: string }> }>(
    `SELECT outcomes FROM workflow WHERE id = $1`, [workflowId]);
  const outcomes = (w?.outcomes ?? []).map((o) => o.name);
  const broken = madeWorse(wouldBreak(steps, outcomes), wouldBreak(reordered, outcomes));
  if (broken) return { ok: false, because: why('Moving it', broken) };

  await db.query('BEGIN');
  try {
    // Positions are unique per workflow, so they are parked out of the way
    // before being written back rather than shuffled in place.
    await db.query(`UPDATE workflow_step SET position = -position WHERE workflow_id = $1`, [workflowId]);
    for (const [i, s] of reordered.entries()) {
      await db.query(`UPDATE workflow_step SET position = $2 WHERE id = $1`, [s.id, i + 1]);
    }
    await returnToDraft(db, workflowId, 'A step was moved');
    await db.query('COMMIT');
    return { ok: true };
  } catch (error) { await db.query('ROLLBACK'); throw error; }
}

export async function deleteStep(db: PoolClient, workflowId: string, stepId: string): Promise<EditResult> {
  const steps = await stepsOf(db, workflowId);
  const remaining = steps.filter((s) => s.id !== stepId);
  if (remaining.length === steps.length) return { ok: false, because: 'There is no such step in this workflow.' };

  const { rows: [w] } = await db.query<{ outcomes: Array<{ name: string }> }>(
    `SELECT outcomes FROM workflow WHERE id = $1`, [workflowId]);
  const outcomes = (w?.outcomes ?? []).map((o) => o.name);
  const broken = madeWorse(wouldBreak(steps, outcomes), wouldBreak(remaining, outcomes));
  if (broken) return { ok: false, because: why('Deleting it', broken) };

  await db.query('BEGIN');
  try {
    await db.query(`DELETE FROM workflow_step WHERE id = $1 AND workflow_id = $2`, [stepId, workflowId]);
    await db.query(`UPDATE workflow_step SET position = -position WHERE workflow_id = $1`, [workflowId]);
    for (const [i, s] of remaining.entries()) {
      await db.query(`UPDATE workflow_step SET position = $2 WHERE id = $1`, [s.id, i + 1]);
    }
    await returnToDraft(db, workflowId, 'A step was deleted');
    await db.query('COMMIT');
    return { ok: true };
  } catch (error) { await db.query('ROLLBACK'); throw error; }
}

/** Validated on save; a step that fails validation is not stored at all. */
export async function editStep(db: PoolClient, workflowId: string, stepId: string,
  declares: Record<string, unknown>): Promise<EditResult> {
  const { rows: [existing] } = await db.query<{ kind: string }>(
    `SELECT kind FROM workflow_step WHERE id = $1 AND workflow_id = $2`, [stepId, workflowId]);
  if (!existing) return { ok: false, because: 'There is no such step in this workflow.' };

  // A step's kind is fixed when it is made. Changing it would make the step a
  // different step wearing the same identity, and run evidence cites steps.
  const checked = stepSchema.safeParse({ id: stepId, kind: existing.kind, ...declares });
  if (!checked.success) {
    return { ok: false, because: checked.error.issues
      .map((i) => `${i.path.join('.') || 'the step'}: ${i.message}`).join('; ') };
  }

  const { id, kind, ...rest } = checked.data;

  // The same gate its siblings have.
  //
  // `moveStep` and `deleteStep` both refuse a change that leaves the draft
  // worse than it was; `editStep` only checked the schema, which was harmless
  // while editing could not change the shape of the workflow. Configuring a
  // `branch` writes `ifTrue` and `ifFalse`, so it can strand a step or make a
  // conclusion unreachable — and the author would find out at publication,
  // about a change they had already been told was fine.
  const steps = await stepsOf(db, workflowId);
  const after = steps.map((s) => (s.id === stepId ? checked.data : s));
  const { rows: [w] } = await db.query<{ outcomes: Array<{ name: string }> }>(
    `SELECT outcomes FROM workflow WHERE id = $1`, [workflowId]);
  const outcomes = (w?.outcomes ?? []).map((o) => o.name);
  const broken = madeWorse(wouldBreak(steps, outcomes), wouldBreak(after, outcomes));
  if (broken) return { ok: false, because: why('Configuring it', broken) };

  await db.query('BEGIN');
  try {
    await db.query(
      `UPDATE workflow_step SET declares = $2, complete = true, updated_at = now() WHERE id = $1`,
      [stepId, JSON.stringify(rest)]);
    await returnToDraft(db, workflowId, 'A step was edited');
    await db.query('COMMIT');
    return { ok: true };
  } catch (error) { await db.query('ROLLBACK'); throw error; }
}

/** An inserted step is incomplete until configured, and blocks publication. */
export async function insertStep(db: PoolClient, workflowId: string, kind: Step['kind'], after: number):
  Promise<{ ok: true; id: string } | { ok: false; because: string }> {
  const steps = await stepsOf(db, workflowId);
  if (after < 0 || after > steps.length) return { ok: false, because: `There is no position ${after}.` };

  const id = crypto.randomUUID();
  await db.query('BEGIN');
  try {
    await db.query(`UPDATE workflow_step SET position = -position WHERE workflow_id = $1`, [workflowId]);
    const order = [...steps.map((s) => s.id)];
    order.splice(after, 0, id);
    await db.query(
      `INSERT INTO workflow_step (id, workflow_id, position, kind, declares, complete)
       VALUES ($1, $2, 0, $3, $4, false)`,
      [id, workflowId, kind, JSON.stringify({ summary: `A new ${kind} step — not configured yet` })]);
    for (const [i, sid] of order.entries()) {
      await db.query(`UPDATE workflow_step SET position = $2 WHERE id = $1`, [sid, i + 1]);
    }
    await returnToDraft(db, workflowId, 'A step was inserted');
    await db.query('COMMIT');
    return { ok: true, id };
  } catch (error) { await db.query('ROLLBACK'); throw error; }
}
