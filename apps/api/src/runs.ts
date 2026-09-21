import { pool } from './db.ts';

/**
 * Everything the run page needs, read from stored records alone.
 *
 * §10 requires a run to be reconstructable "from stored records alone, without
 * re-running anything". That is not a nice property of this query; it is the
 * reason the query can exist at all.
 */
export async function readRun(reference: string) {
  const { rows: [run] } = await pool.query(
    `SELECT r.id, r.reference, r.status, r.outcome, r.is_test, r.inputs, r.outputs, r.error,
            r.started_by, r.queued_at, r.started_at, r.ended_at, r.retries,
            -- The reference rather than the id, because the link is for a
            -- person to follow and a reference is what a person quotes.
            original.reference AS rerun_of_reference,
            v.version, v.digest, v.outcomes, v.declared_inputs, v.applications, v.published_at,
            v.may_change_records, w.name AS workflow_name, w.id AS workflow_id
       FROM run r
       JOIN workflow_version v ON v.id = r.version_id
       JOIN workflow w ON w.id = v.workflow_id
       LEFT JOIN run original ON original.id = r.rerun_of
      WHERE r.reference = $1`, [reference]);
  if (!run) return null;

  const { rows: attempts } = await pool.query(
    `SELECT id, step_position, step_kind, attempt, pass, outcome, started_at, ended_at
       FROM step_attempt WHERE run_id = $1 ORDER BY step_position, attempt`, [run.id]);
  const { rows: events } = await pool.query(
    `SELECT id, attempt_id, kind, detail, at FROM run_event WHERE run_id = $1 ORDER BY id`, [run.id]);
  const { rows: artefacts } = await pool.query(
    `SELECT id, attempt_id, kind, media_type, bytes, shows, digest, withheld, withheld_why
       FROM artefact WHERE run_id = $1 ORDER BY captured_at`, [run.id]);

  // The version's own steps, so a step's summary comes from the artefact that
  // executed rather than from a draft somebody has edited since.
  const steps = (run.body?.steps ?? []) as unknown[];

  return {
    run, steps, attempts, events,
    stepArtefacts: artefacts.filter((a) => a.attempt_id !== null),
    runArtefacts: artefacts.filter((a) => a.attempt_id === null),
  };
}

export async function readRunSteps(reference: string) {
  const { rows: [row] } = await pool.query(
    `SELECT v.body FROM run r JOIN workflow_version v ON v.id = r.version_id WHERE r.reference = $1`,
    [reference]);
  return (row?.body?.steps ?? []) as Array<{ kind: string; summary: string }>;
}

export async function listRuns() {
  const { rows } = await pool.query(
    `SELECT r.reference, r.status, r.outcome, r.started_at, r.ended_at, v.version, w.name AS workflow_name
       FROM run r JOIN workflow_version v ON v.id = r.version_id JOIN workflow w ON w.id = v.workflow_id
      ORDER BY r.queued_at DESC LIMIT 50`);
  return rows;
}
