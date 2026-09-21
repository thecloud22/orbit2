/**
 * The acts a person performs, over HTTP.
 *
 * Each of these is a deliberate human act (§4): nothing here may be triggered
 * by an automated part of Orbit, and each is audited. They are separate
 * endpoints rather than one "advance" because confirming, publishing,
 * activating and starting are four distinct facts on the record even when the
 * same person does all four.
 */
import type { IncomingMessage } from 'node:http';
import { pool } from './db.ts';
import { archive, mayStart, pause, resume } from './activate.ts';
import { confirm, confirmation } from './confirm.ts';
import { configureStep } from './configure.ts';
import { mintVersion } from './mint.ts';
import { bringIn, finishRecording, startRecording } from './authoring.ts';
import { cancelRun, retryRun, rerun } from './control.ts';
import { deleteStep, editStep, insertStep, moveStep } from './edit.ts';
import { editApplication, registerApplication } from './applications.ts';
import { describeBlocker } from '@orbit/contract';

export async function readBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}

const inTransaction = async <T>(work: (db: never) => Promise<T>): Promise<T> => {
  const db = await pool.connect();
  try { return await work(db as never); } finally { db.release(); }
};

export const actions = {
  async confirm(workflowId: string, body: unknown) {
    // Checked before it reaches the rule, so a malformed request is answered
    // rather than raised. A 400 is the honest code: nothing was wrong with the
    // workflow, the request did not say what it was asking for.
    const given = confirmation.safeParse(body);
    if (!given.success) {
      return { status: 400, body: { why: 'This confirmation is not complete: '
        + given.error.issues.map((i) => `${i.path.join('.') || 'the body'} — ${i.message}`).join('; ') } };
    }
    const result = await inTransaction((db) => confirm(db, workflowId, given.data));
    return result.outcome === 'confirmed'
      ? { status: 200, body: result }
      : { status: 409, body: { ...result, blockers: result.blockers.map(describeBlocker) } };
  },

  async publish(workflowId: string) {
    const result = await inTransaction((db) => mintVersion(db, workflowId));
    return result.outcome === 'published'
      ? { status: 201, body: result }
      // Refused is not an error. It is the gate doing its job, and the caller
      // gets every blocker rather than the first.
      : { status: 409, body: { ...result, blockers: result.blockers.map(describeBlocker) } };
  },

  async configureStep(workflowId: string, body: unknown) {
    const { stepId, ...declares } = (body ?? {}) as { stepId?: string };
    if (!stepId) return { status: 400, body: { why: 'Which step is being configured?' } };
    const result = await inTransaction((db) => configureStep(db, workflowId, stepId, declares));
    return result.ok ? { status: 200, body: result } : { status: 409, body: { why: result.because } };
  },

  async pause(workflowId: string, body: unknown) {
    const why = (body as { why?: string }).why ?? 'No reason given.';
    await inTransaction((db) => pause(db, workflowId, why));
    return { status: 200, body: { paused: true, why } };
  },

  async archive(workflowId: string, body: unknown) {
    const why = String((body as { why?: unknown })?.why ?? '').trim();
    if (!why) {
      return { status: 400, body: { why: 'Say why it is being retired. The audit trail records the reason, not just the act.' } };
    }
    await inTransaction((db) => archive(db, workflowId, why));
    return { status: 200, body: { outcome: 'archived' } };
  },

  async resume(workflowId: string) {
    await inTransaction((db) => resume(db, workflowId));
    return { status: 200, body: { paused: false } };
  },

  async editStep(workflowId: string, body: unknown) {
    const { stepId, declares } = body as { stepId: string; declares: Record<string, unknown> };
    const result = await inTransaction((db) => editStep(db, workflowId, stepId, declares));
    // A refusal is not an error. It is the editor doing what §6 asks, and the
    // caller gets the reason rather than a status code to interpret.
    return result.ok ? { status: 200, body: result } : { status: 409, body: { why: result.because } };
  },

  async moveStep(workflowId: string, body: unknown) {
    const { stepId, to } = body as { stepId: string; to: number };
    const result = await inTransaction((db) => moveStep(db, workflowId, stepId, to));
    return result.ok ? { status: 200, body: result } : { status: 409, body: { why: result.because } };
  },

  async deleteStep(workflowId: string, body: unknown) {
    const { stepId } = body as { stepId: string };
    const result = await inTransaction((db) => deleteStep(db, workflowId, stepId));
    return result.ok ? { status: 200, body: result } : { status: 409, body: { why: result.because } };
  },

  async insertStep(workflowId: string, body: unknown) {
    const { kind, after } = body as { kind: never; after: number };
    const result = await inTransaction((db) => insertStep(db, workflowId, kind, after));
    return result.ok ? { status: 201, body: result } : { status: 409, body: { why: result.because } };
  },

  /**
   * §10: inputs are validated before a run is created. A run that exists with
   * invalid inputs is a run somebody has to explain later.
   */
  async startRun(versionId: string, body: unknown) {
    const may = await inTransaction((db) => mayStart(db, versionId));
    if (!may.may) return { status: 409, body: { why: may.because } };

    const { rows: [version] } = await pool.query<{ declared_inputs: Array<{ name: string; label: string; required: boolean }> }>(
      `SELECT declared_inputs FROM workflow_version WHERE id = $1`, [versionId]);
    const given = ((body as { inputs?: Record<string, string> }).inputs) ?? {};

    const missing = (version?.declared_inputs ?? [])
      .filter((i) => i.required && !String(given[i.name] ?? '').trim())
      .map((i) => i.label);
    if (missing.length > 0) {
      return { status: 422, body: { why: `Needed before a run can be created: ${missing.join(', ')}.`, missing } };
    }

    const reference = crypto.randomUUID().slice(0, 6).toUpperCase();
    const { rows: [run] } = await pool.query<{ reference: string }>(
      `INSERT INTO run (version_id, reference, status, inputs) VALUES ($1, $2, 'queued', $3) RETURNING reference`,
      [versionId, reference, JSON.stringify(given)]);
    await pool.query(
      `INSERT INTO audit_entry (act, object_kind, object_id, changed) VALUES ('run started', 'run', $1, $2)`,
      [versionId, JSON.stringify({ reference })]);
    return { status: 201, body: { reference: run!.reference } };
  },

  // §10's run controls. Each refusal carries its reason, because "this run is
  // succeeded, so there is nothing to stop" is an answer rather than a fault.
  async cancelRun(reference: string) {
    const result = await inTransaction((db) => cancelRun(db, reference));
    return result.ok ? { status: 200, body: result } : { status: 409, body: { why: result.because } };
  },

  async retryRun(reference: string) {
    const result = await inTransaction((db) => retryRun(db, reference));
    return result.ok ? { status: 200, body: result } : { status: 409, body: { why: result.because } };
  },

  /** §5's first way in, asked for from the screen rather than a terminal. */
  async bringIn(body: unknown) {
    const result = await inTransaction((db) => bringIn(db, body));
    return result.ok ? { status: 202, body: result } : { status: 422, body: { why: result.because } };
  },

  /** §5's other way in: a demonstration, recorded. */
  async startRecording(body: unknown) {
    const result = await inTransaction((db) => startRecording(db, body));
    return result.ok ? { status: 202, body: result } : { status: 422, body: { why: result.because } };
  },

  async finishRecording(id: string) {
    const result = await inTransaction((db) => finishRecording(db, id));
    return result.ok ? { status: 200, body: result } : { status: 409, body: { why: result.because } };
  },

  async rerun(reference: string) {
    const result = await inTransaction((db) => rerun(db, reference));
    return result.ok ? { status: 201, body: result } : { status: 409, body: { why: result.because } };
  },

  /** Admin: what an agent can reach is registered here first (Decision 5). */
  async registerApplication(body: unknown) {
    const result = await inTransaction((db) => registerApplication(db, body));
    return result.ok ? { status: 201, body: result } : { status: 422, body: { why: result.because } };
  },

  async editApplication(applicationId: string, body: unknown) {
    const result = await inTransaction((db) => editApplication(db, applicationId, body));
    if (result.ok) return { status: 200, body: result };
    return { status: result.notFound ? 404 : 422, body: { why: result.because } };
  },
};
