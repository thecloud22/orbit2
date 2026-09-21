/**
 * Testing before activation.
 *
 * §4: a version exists but no operator can start it until every declared
 * ending has been proved by a run. "Activation is gated on evidence rather
 * than on assertion" — and the evidence is the runs themselves, made with the
 * example values the process owner supplied when they confirmed, so the tests
 * exercise the endings they said the procedure can reach.
 *
 * A passed case links to the run that proved it, and that run keeps its full
 * evidence. An ending nothing has reached cannot be signed off by saying it
 * probably works.
 */
import type { PoolClient } from 'pg';

export interface TestCase {
  outcome: string;
  label: string;
  example: Record<string, string>;
  /** The run that reached this ending, if one has. */
  provedBy: { reference: string; at: string } | null;
}

export async function testCases(db: PoolClient, versionId: string): Promise<TestCase[]> {
  const { rows: [version] } = await db.query<{
    outcomes: Array<{ name: string; label: string }>; workflow_id: string;
  }>(`SELECT outcomes, workflow_id FROM workflow_version WHERE id = $1`, [versionId]);
  if (!version) return [];

  const { rows: [workflow] } = await db.query<{ examples: Record<string, Record<string, string>> }>(
    `SELECT examples FROM workflow WHERE id = $1`, [version.workflow_id]);

  const { rows: proofs } = await db.query<{ outcome: string; reference: string; ended_at: string }>(
    `SELECT DISTINCT ON (outcome) outcome, reference, ended_at
       FROM run
      WHERE version_id = $1 AND status = 'succeeded' AND is_test AND outcome IS NOT NULL
      ORDER BY outcome, ended_at DESC`, [versionId]);
  const proved = new Map(proofs.map((p) => [p.outcome, p]));

  return version.outcomes.map((o) => {
    const proof = proved.get(o.name);
    return {
      outcome: o.name, label: o.label,
      example: workflow?.examples?.[o.name] ?? {},
      provedBy: proof ? { reference: proof.reference, at: proof.ended_at } : null,
    };
  });
}

export type ActivateResult =
  | { outcome: 'activated'; version: number }
  | { outcome: 'refused'; unproved: string[] };

export async function activate(db: PoolClient, versionId: string): Promise<ActivateResult> {
  const cases = await testCases(db, versionId);
  // A version declaring no outcome has nothing unproved, so the gate below
  // would pass over an empty list and activate it on no evidence. An empty
  // gate is not a passed gate.
  if (cases.length === 0) {
    return { outcome: 'refused',
      unproved: ['This version declares no conclusion, so no run could prove anything about it.'] };
  }

  const unproved = cases.filter((c) => !c.provedBy).map((c) => c.label);
  // Every ending, not most of them. A path nobody has taken is a path nobody
  // knows the behaviour of, and activation is what lets an operator take it.
  if (unproved.length > 0) return { outcome: 'refused', unproved };

  // The version is not touched. The workflow points at it, because which
  // version is live is a changing thing and a version is a fact.
  const { rows: [version] } = await db.query<{ version: number; workflow_id: string }>(
    `SELECT version, workflow_id FROM workflow_version WHERE id = $1`, [versionId]);
  await db.query(
    `UPDATE workflow SET live_version_id = $2, paused_at = NULL, updated_at = now() WHERE id = $1`,
    [version!.workflow_id, versionId]);

  await db.query(
    `INSERT INTO audit_entry (act, object_kind, object_id, changed)
     VALUES ('version activated', 'workflow_version', $1, $2)`,
    [versionId, JSON.stringify({ provedBy: cases.map((c) => c.provedBy?.reference) })]);

  return { outcome: 'activated', version: version!.version };
}

/** New runs are prevented deliberately; runs already going are unaffected (§4). */
export async function pause(db: PoolClient, workflowId: string, why: string): Promise<void> {
  await db.query(`UPDATE workflow SET paused_at = now(), updated_at = now() WHERE id = $1`, [workflowId]);
  await db.query(
    `INSERT INTO audit_entry (act, object_kind, object_id, changed, reason)
     VALUES ('agent paused', 'workflow', $1, '{}', $2)`, [workflowId, why]);
}

export async function resume(db: PoolClient, workflowId: string): Promise<void> {
  await db.query(`UPDATE workflow SET paused_at = NULL, updated_at = now() WHERE id = $1`, [workflowId]);
  await db.query(
    `INSERT INTO audit_entry (act, object_kind, object_id, changed)
     VALUES ('agent resumed', 'workflow', $1, '{}')`, [workflowId]);
}

/**
 * §4 refuses a run of a version that is not active, that is paused, that
 * belongs to an archived agent, or that was superseded — and names which. A
 * request for a superseded version is refused rather than silently redirected
 * to the current one, because running something other than what was asked for
 * is indistinguishable from running the wrong thing.
 */
export async function mayStart(db: PoolClient, versionId: string):
  Promise<{ may: true } | { may: false; because: string }> {
  const { rows: [row] } = await db.query<{
    live_version_id: string | null; paused_at: string | null; archived_at: string | null; version: number;
  }>(`SELECT w.live_version_id, w.paused_at, w.archived_at, v.version
        FROM workflow_version v JOIN workflow w ON w.id = v.workflow_id WHERE v.id = $1`, [versionId]);

  if (!row) return { may: false, because: 'There is no such version.' };
  if (row.archived_at) return { may: false, because: 'This agent is archived, so no new run can start.' };
  if (row.paused_at) return { may: false, because: 'This agent is paused. Runs already going are unaffected.' };
  if (!row.live_version_id) return { may: false, because: 'No version of this agent has been activated yet.' };
  if (row.live_version_id !== versionId) {
    return { may: false, because: `Version ${row.version} has been superseded. It is not started in place of the live one.` };
  }
  return { may: true };
}

/** Queues one run per unproved ending, with the author's own example values. */
export async function queueTests(db: PoolClient, versionId: string): Promise<string[]> {
  const queued: string[] = [];
  for (const testCase of await testCases(db, versionId)) {
    if (testCase.provedBy) continue;
    const reference = `T-${crypto.randomUUID().slice(0, 6).toUpperCase()}`;
    await db.query(
      `INSERT INTO run (version_id, reference, status, is_test, inputs)
       VALUES ($1, $2, 'queued', true, $3)`,
      [versionId, reference, JSON.stringify(testCase.example)]);
    queued.push(reference);
  }
  return queued;
}
