import { pool } from './db.ts';
import { evidenceRoot } from './artefacts.ts';

/**
 * What is registered, what has been spent, and where this runs.
 *
 * §8: Orbit reports whether a named credential is configured; it never reports
 * what it is. There is no query here that could return one — the column is not
 * selected, so no future change to a serialiser can start including it.
 */
export async function readAdmin() {
  const { rows: applications } = await pool.query(
    `SELECT DISTINCT ON (a.id)
            a.id, a.name, a.surface, a.retired_at,
            r.revision, r.addresses, r.sign_in_as, r.credential_name,
            (c.name IS NOT NULL) AS credential_set
       FROM application a
       JOIN application_revision r ON r.application_id = a.id
       LEFT JOIN credential c ON c.name = r.credential_name
      ORDER BY a.id, r.revision DESC`);

  const { rows: [spend] } = await pool.query<{ building: string; running: string; calls: string; model: string | null }>(
    `SELECT coalesce(sum(cost_micros) FILTER (WHERE workflow_id IS NOT NULL), 0)::text AS building,
            coalesce(sum(cost_micros) FILTER (WHERE run_id IS NOT NULL), 0)::text AS running,
            count(*)::text AS calls,
            max(model) AS model
       FROM model_call`);

  const { rows: perAgent } = await pool.query(
    `SELECT w.id, w.name, coalesce(sum(m.cost_micros), 0)::text AS cost_micros, count(m.*)::int AS calls
       FROM workflow w LEFT JOIN model_call m ON m.workflow_id = w.id
      GROUP BY w.id, w.name ORDER BY w.created_at DESC`);

  return {
    applications,
    spend,
    perAgent,
    deployment: {
      runsOn: 'local',
      // Shown as it actually is. A region is not displayed until something
      // runs in one (Decision 8).
      region: null,
      recordStore: 'postgres, local',
      evidence: evidenceRoot,
      environments: 'One. Practice and live are not separated yet.',
      provider: process.env['ORBIT_MODEL_PROVIDER'] ?? null,
      model: process.env['ORBIT_MODEL'] ?? null,
    },
  };
}

export async function readAudit(limit = 60) {
  const { rows } = await pool.query(
    `SELECT id, act, object_kind, object_id, changed, reason, actor, run_id, at
       FROM audit_entry ORDER BY id DESC LIMIT $1`, [limit]);
  const { rows: [count] } = await pool.query<{ n: string }>(`SELECT count(*)::text AS n FROM audit_entry`);
  return { entries: rows, total: count?.n ?? '0' };
}
