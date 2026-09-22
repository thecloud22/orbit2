/**
 * Publication mints. It never edits (§4).
 *
 * The version's body is serialised canonically and hashed, and that digest
 * covers the steps, the declared values, the outcomes **and the copied
 * application revisions** — so "what it could not have done" is inside the
 * thing that was approved rather than in a row an administrator can edit
 * afterwards (Decision 5).
 */
import { createHash } from 'node:crypto';
import type { PoolClient } from 'pg';
import { asDraftStep, checkForPublication, type DraftStep } from './publish.ts';

const unfinishedStep = (s: DraftStep): boolean => 'incomplete' in s;
import { type Blocker, type Publication, step as stepSchema, type Step } from '@orbit/contract';

/**
 * Key order changes a hash and must not change an identity, so the body is
 * serialised with keys sorted at every depth. Two publications of the same
 * workflow produce the same digest, or the digest is measuring the serialiser.
 */
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : 1));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
  }
  return JSON.stringify(value ?? null);
}

export async function mintVersion(db: PoolClient, workflowId: string): Promise<Publication> {
  const { rows: [workflow] } = await db.query<{ confirmed_at: string | null }>(
    `SELECT confirmed_at FROM workflow WHERE id = $1`, [workflowId]);
  if (!workflow) throw new Error('no such workflow');

  const { rows: stepRows } = await db.query<{ id: string; kind: string; declares: Record<string, unknown> }>(
    `SELECT id, kind, declares FROM workflow_step WHERE workflow_id = $1 ORDER BY position`, [workflowId]);
  const { rows: notes } = await db.query<{ kind: string; body: string; position: number | null }>(
    `SELECT n.kind, n.body, s.position FROM workflow_note n
       LEFT JOIN workflow_step s ON s.id = n.step_id
      WHERE n.workflow_id = $1 AND n.resolved_at IS NULL`, [workflowId]);
  const { rows: declared } = await db.query<{ outcomes: unknown; inputs: unknown; examples: unknown }>(
    `SELECT coalesce(w.outcomes, '[]'::jsonb) AS outcomes,
            coalesce(w.declared_inputs, '[]'::jsonb) AS inputs,
            coalesce(w.examples, '{}'::jsonb) AS examples
       FROM workflow w WHERE w.id = $1`, [workflowId]);

  // Validated coming out of the store, because persistence is a boundary — but
  // a half-written step is a refusal to publish, not a crash. §6: it blocks
  // publication until it is configured, and "blocks" means it is reported.
  const steps: DraftStep[] = stepRows.map(asDraftStep);

  const blockers: Blocker[] = [];

  // §4: "Cannot be published until confirmed." Confirmation is the act that
  // fixes the workflow as the thing somebody attested to, and publication
  // mints a version of exactly that.
  if (!workflow.confirmed_at) blockers.push({ kind: 'notConfirmed' });

  // An outstanding question, assumption, exception or unacknowledged risk
  // blocks confirmation, and therefore publication (§4, criterion 3).
  for (const note of notes) {
    blockers.push({
      kind: 'outstanding',
      note: note.kind as 'question' | 'assumption' | 'exception' | 'risk',
      body: note.body,
      ...(note.position ? { step: note.position } : {}),
    });
  }

  const outcomes = (declared[0]?.outcomes ?? []) as Array<{ name: string }>;
  const inputs = (declared[0]?.inputs ?? []) as Array<{ name: string }>;
  const examples = (declared[0]?.examples ?? {}) as Record<string, unknown>;

  blockers.push(...checkForPublication(steps, {
    inputs: inputs.map((i) => i.name),
    outcomes: outcomes.map((o) => o.name),
    examples,
  }));

  const { rows: apps } = await db.query(
    // a.surface is copied because Decision 5 requires the version to be
    // "wholly self-contained: surface, host lists and credential name are
    // inside the version". Without it the worker would have to ask the live
    // application what it is driving, and editing that application later would
    // silently change how an already-published version runs.
    //
    // Only the application this workflow was brought in against. This copied
    // the whole registry, and the worker runs against the first entry, so a
    // version authored against the mortgage portal ran against google.com the
    // day somebody registered a test application whose id sorted first.
    // Decision 5 item 8: a workflow names its own set.
    `SELECT DISTINCT ON (a.id) a.name, a.surface, r.revision, r.addresses, r.sign_in_as, r.credential_name, r.formats
       FROM application a JOIN application_revision r ON r.application_id = a.id
      WHERE a.id IN (
        SELECT application_id FROM understanding WHERE workflow_id = $1
        UNION SELECT application_id FROM authoring_session WHERE workflow_id = $1 OR into_workflow_id = $1
        UNION SELECT application_id FROM recording_session WHERE workflow_id = $1)
      ORDER BY a.id, r.revision DESC`, [workflowId]);
  if (apps.length === 0) blockers.push({ kind: 'applicationUnknown' });
  // Slice 1 fills the set with exactly one (Decision 5 item 8), and the worker
  // runs against the first. Two would be a choice the version cannot make yet.
  if (apps.length > 1) blockers.push({ kind: 'applicationUnknown' });

  if (blockers.length > 0) return { outcome: 'refused', blockers };

  const { rows: [previous] } = await db.query<{ next: number }>(
    `SELECT coalesce(max(version), 0) + 1 AS next FROM workflow_version WHERE workflow_id = $1`, [workflowId]);
  const version = Number(previous!.next);

  const body = { steps, declaredInputs: inputs, outcomes, applications: apps };
  const digest = `sha256:${createHash('sha256').update(canonical(body)).digest('hex')}`;

  // Derived from the steps, not asserted. It was written as `false` for every
  // version, so a version containing a step that presses "Approve file"
  // claimed no authority to write — and the run page reported "It changed:
  // Nothing" about runs that had approved a loan. §7 makes this the flag that
  // decides what authority a version needs; a constant false is not a modest
  // default, it is a false statement on the record.
  const mayChangeRecords = steps.some((s) => !unfinishedStep(s) && 'changesARecord' in s && s.changesARecord);

  const { rows: [minted] } = await db.query<{ id: string }>(
    `INSERT INTO workflow_version
       (workflow_id, version, body, digest, outcomes, declared_inputs, applications, may_change_records)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
    [workflowId, version, JSON.stringify(body), digest,
     JSON.stringify(outcomes), JSON.stringify(inputs), JSON.stringify(apps), mayChangeRecords]);

  // Publishing makes it the live version.
  //
  // There used to be a further act: a version was published, then every
  // conclusion it declared had to be reached by a real run, and only then
  // could it be activated. That gate is off by decision — four stages where
  // the fourth reads as a separate phase of the workflow confused more than
  // it protected. Publication is now the commitment.
  //
  // What is no longer enforced, said plainly so nobody has to rediscover it:
  // a version can be started against a real system without any conclusion it
  // declares ever having been reached by a run. The machinery that proved it
  // is still here — `testCases`, `queueTests` and `activate` are untouched —
  // so restoring the gate is putting this line back, not rebuilding anything.
  await db.query(
    `UPDATE workflow SET live_version_id = $2, updated_at = now() WHERE id = $1`,
    [workflowId, minted!.id]);

  await db.query(
    `INSERT INTO audit_entry (act, object_kind, object_id, changed)
     VALUES ('version published', 'workflow_version', $1, $2)`,
    [workflowId, JSON.stringify({ version, digest, steps: steps.length })]);

  return { outcome: 'published', version, digest };
}
