import { pool } from './db.ts';
import { asDraftStep } from './publish.ts';

/**
 * A draft, and how it came to say what it says.
 *
 * The turns are served alongside the steps rather than behind a separate
 * request, because they are not diagnostics — §12 keeps authoring provenance
 * "as evidence rather than as a log", and a reviewer asking "why does step 4
 * read that?" should not have to go looking.
 */
export async function readWorkflow(id: string) {
  const { rows: [workflow] } = await pool.query(
    `SELECT id, name, describe, procedure, confirmed_at, created_at,
            coalesce(declared_inputs, '[]'::jsonb) AS declared_inputs,
            live_version_id, paused_at
       FROM workflow WHERE id = $1`, [id]);
  if (!workflow) return null;

  const { rows: stepRows } = await pool.query<{
    id: string; position: number; kind: string; declares: Record<string, unknown>; complete: boolean;
  }>(`SELECT id, position, kind, declares, complete FROM workflow_step
      WHERE workflow_id = $1 ORDER BY position`, [id]);

  // What each step does not say yet, decided by the schema rather than by the
  // screen. `complete` is a column somebody set; this is the thing itself.
  // They disagreed: confirmation wrote `complete = true` without re-parsing,
  // so a hand-added ending arrived here marked finished and was then refused
  // at publication for the `publishes` it never had.
  const steps = stepRows.map((r) => {
    const parsed = asDraftStep(r);
    return { ...r, missing: 'incomplete' in parsed ? parsed.missing : [] };
  });
  const { rows: notes } = await pool.query(
    `SELECT id, step_id, kind, body, answer, resolved_at FROM workflow_note
      WHERE workflow_id = $1 ORDER BY created_at`, [id]);
  const { rows: turns } = await pool.query(
    `SELECT turn, provider, model, shown, answered, verdict, why, tokens_in, tokens_out, cost_micros
       FROM model_call WHERE workflow_id = $1 ORDER BY turn`, [id]);
  // Activation is the workflow's pointer, not a column on the version — a
  // version is a fact and cannot be rewritten to say it went live (0008).
  const { rows: versions } = await pool.query(
    `SELECT v.id, v.version, v.digest, v.published_at, v.body->'understanding'->'coverage' AS coverage,
            (v.id = w.live_version_id) AS live, w.paused_at
       FROM workflow_version v JOIN workflow w ON w.id = v.workflow_id
      WHERE v.workflow_id = $1 ORDER BY v.version DESC`, [id]);

  // Orbit 2.1: where the sort stands, for a draft that was brought in to be understood.
  const { rows: [understanding] } = await pool.query(
    `SELECT status, confirmed_at FROM understanding WHERE workflow_id = $1`, [id]);

  return {
    workflow, steps, notes, versions, understanding: understanding ?? null,
    authoring: {
      turns,
      /** Kept apart on purpose: a count of turns that says nothing about how
       *  many produced nothing usable is the flattering half of the number. */
      producedNothing: turns.filter((t) => t.verdict !== 'kept').length,
      costMicros: turns.reduce((sum, t) => sum + Number(t.cost_micros ?? 0), 0),
      /** A null cost is a turn whose model has no price held, not a free one.
       *  Summed as zero it reads as "this cost nothing to build", which is a
       *  figure nobody can act on and one the spend record must not assert. */
      costUnknown: turns.some((t) => t.cost_micros === null),
    },
  };
}

export async function listWorkflows() {
  const { rows } = await pool.query(
    `SELECT w.id, w.name, w.confirmed_at, w.created_at,
            (SELECT count(*) FROM workflow_step s WHERE s.workflow_id = w.id) AS steps,
            (SELECT count(*) FROM workflow_note n WHERE n.workflow_id = w.id AND n.resolved_at IS NULL) AS outstanding,
            (SELECT max(version) FROM workflow_version v WHERE v.workflow_id = w.id) AS live_version
       FROM workflow w WHERE w.archived_at IS NULL ORDER BY w.created_at DESC`);
  return rows;
}
