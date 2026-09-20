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
import { activate, mayStart, pause, queueTests, resume } from './activate.ts';
import { confirm, type Confirmation } from './confirm.ts';
import { mintVersion } from './mint.ts';
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
    const result = await inTransaction((db) => confirm(db, workflowId, body as Confirmation));
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

  async queueTests(versionId: string) {
    const queued = await inTransaction((db) => queueTests(db, versionId));
    return { status: 201, body: { queued } };
  },

  async activate(versionId: string) {
    const result = await inTransaction((db) => activate(db, versionId));
    return result.outcome === 'activated' ? { status: 200, body: result } : { status: 409, body: result };
  },

  async pause(workflowId: string, body: unknown) {
    const why = (body as { why?: string }).why ?? 'No reason given.';
    await inTransaction((db) => pause(db, workflowId, why));
    return { status: 200, body: { paused: true, why } };
  },

  async resume(workflowId: string) {
    await inTransaction((db) => resume(db, workflowId));
    return { status: 200, body: { paused: false } };
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
};
