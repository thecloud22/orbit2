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

/**
 * What a run of this version needs to be given.
 *
 * This was `testCases`, and it existed for a panel that ran the agent once per
 * conclusion before it could go live. That panel is gone: a version is
 * published and run, and the run is the proof. What the screen still needs
 * from a version is the plain question it always asked underneath — what does
 * somebody have to supply to start this — and that is the version's declared
 * inputs, not the union of the example values an author happened to type.
 */
export interface VersionNeeds {
  inputs: Array<{ name: string; label: string; required: boolean }>;
  outcomes: Array<{ name: string; label: string }>;
}

export async function versionNeeds(db: PoolClient, versionId: string): Promise<VersionNeeds | null> {
  const { rows: [version] } = await db.query<{
    outcomes: Array<{ name: string; label: string }>;
    declared_inputs: Array<{ name: string; label: string; required: boolean }>;
  }>(`SELECT outcomes, declared_inputs FROM workflow_version WHERE id = $1`, [versionId]);
  if (!version) return null;
  return { inputs: version.declared_inputs ?? [], outcomes: version.outcomes ?? [] };
}

export async function pause(db: PoolClient, workflowId: string, why: string): Promise<void> {
  await db.query(`UPDATE workflow SET paused_at = now(), updated_at = now() WHERE id = $1`, [workflowId]);
  await db.query(
    `INSERT INTO audit_entry (act, object_kind, object_id, changed, reason)
     VALUES ('agent paused', 'workflow', $1, '{}', $2)`, [workflowId, why]);
}

/**
 * Retiring an agent that is not worth keeping.
 *
 * Not a delete, and it cannot be one. Its versions, its runs, the evidence
 * those runs captured and the model calls that authored it are append-only —
 * `UPDATE` and `DELETE` are revoked and a trigger refuses them besides — which
 * is the guarantee the whole product rests on. An agent that could be removed
 * from the record is an agent whose record proves nothing.
 *
 * So what is removed is the agent as a live thing: it disappears from the list
 * and `mayStart` refuses every run against it. What it did stays exactly where
 * it was, and the audit trail gains the act of retiring it.
 */
export async function archive(db: PoolClient, workflowId: string, why: string): Promise<void> {
  await db.query(
    `UPDATE workflow SET archived_at = now(), live_version_id = NULL, updated_at = now() WHERE id = $1`,
    [workflowId]);
  await db.query(
    `INSERT INTO audit_entry (act, object_kind, object_id, changed, reason)
     VALUES ('agent archived', 'workflow', $1, '{}', $2)`, [workflowId, why]);
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
