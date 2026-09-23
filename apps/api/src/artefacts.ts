/**
 * Serving an artefact, and verifying it on the way out.
 *
 * §12: "Orbit verifies an artefact against its digest when serving it, and
 * reports a mismatch as an integrity failure rather than serving content that
 * may have changed." So the bytes are re-hashed on every read and compared to
 * the digest recorded when they were captured — a file that changed on disk is
 * refused rather than shown, and the refusal says which artefact.
 *
 * The digest is also the address, so there is no separate filename that could
 * drift from the record.
 */
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pool } from './db.ts';

/** Anything that can run a query: a pool, a client, a transaction. */
export interface Queryable {
  query<R extends Record<string, unknown>>(sql: string, values?: unknown[]): Promise<{ rows: R[] }>;
}

/**
 * One store, wherever the process happens to be started from.
 *
 * This defaulted to './data/evidence', which is relative to the working
 * directory — so the worker wrote evidence under apps/worker and the API
 * looked for it under apps/api, and every screenshot a run captured was
 * missing by the time anyone tried to look at it. Anchoring the default to
 * this file's location instead of the caller's cwd makes the two agree by
 * construction rather than by everyone remembering to set the variable. *
 * Setting the variable to a *relative* path put the bug straight back: the
 * default was anchored here, but `resolve('./data/evidence')` is resolved
 * against the caller's cwd, and `.env.example` shipped exactly that. So a
 * fresh install had the worker writing under apps/worker again while the API
 * looked under apps/api — working on the one machine whose .env had been
 * edited by hand to an absolute path, and nowhere else. A configured path is
 * now anchored the same way, and an absolute one is still taken as given.
 */
const anchor = join(import.meta.dirname, '..', '..', '..');
const configured = process.env['ORBIT_EVIDENCE_DIR'];
// resolve() returns an absolute path unchanged, so this honours one and
// anchors a relative one, rather than choosing between the two.
const root = configured ? resolve(anchor, configured) : join(anchor, 'data', 'evidence');

/**
 * Where evidence actually is, for anything that reports it.
 *
 * Exported rather than recomputed because the Admin screen showed the raw
 * variable — "./data/evidence" — which is the one answer that cannot help.
 * The screen somebody opens when evidence is missing is the last place to
 * print the setting rather than where the setting landed.
 */
export const evidenceRoot = root;

export type Served =
  | { ok: true; bytes: Buffer; mediaType: string }
  | { ok: false; kind: 'notFound' | 'withheld' | 'integrityFailure'; describe: string };

/**
 * A walk turn's picture, by its digest — served only if some walk recorded
 * it, and verified against the digest like any artefact.
 */
export async function serveScreen(digest: string, db: Queryable = pool): Promise<Served> {
  if (!/^sha256:[0-9a-f]{64}$/.test(digest)) return { ok: false, kind: 'notFound', describe: 'Not a picture reference.' };
  const { rows: [known] } = await db.query<{ n: number }>(
    `SELECT 1 AS n FROM model_call WHERE screenshot->>'digest' = $1
      UNION SELECT 1 FROM authoring_session s, jsonb_array_elements(s.captured) c WHERE c->'screenshot'->>'digest' = $1
      LIMIT 1`, [digest]);
  if (!known) return { ok: false, kind: 'notFound', describe: 'No walk recorded that picture.' };
  const hex = digest.slice(7);
  let bytes: Buffer;
  try { bytes = await readFile(join(root, hex.slice(0, 2), hex.slice(2))); }
  catch { return { ok: false, kind: 'notFound', describe: 'The picture is recorded but its bytes are not in the store.' }; }
  const actual = `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
  if (actual !== digest) return { ok: false, kind: 'integrityFailure', describe: 'The picture does not match its record.' };
  return { ok: true, bytes, mediaType: 'image/png' };
}

export async function serveArtefact(id: string, db: Queryable = pool): Promise<Served> {
  const { rows: [row] } = await db.query<{
    digest: string | null; media_type: string | null; withheld: boolean; withheld_why: string | null;
  }>(`SELECT digest, media_type, withheld, withheld_why FROM artefact WHERE id = $1`, [id]);

  if (!row) return { ok: false, kind: 'notFound', describe: 'No artefact with that reference.' };
  if (row.withheld) {
    // Not an error: a withheld artefact is a record carrying its reason.
    return { ok: false, kind: 'withheld', describe: row.withheld_why ?? 'It was withheld.' };
  }

  const digest = row.digest!;
  const hex = digest.replace(/^sha256:/, '');
  let bytes: Buffer;
  try {
    bytes = await readFile(join(root, hex.slice(0, 2), hex.slice(2)));
  } catch {
    return { ok: false, kind: 'notFound', describe: 'The artefact is recorded but its bytes are not in the store.' };
  }

  const actual = `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
  if (actual !== digest) {
    return { ok: false, kind: 'integrityFailure',
      describe: `This artefact does not match the digest recorded when it was captured. It is not being served.` };
  }
  return { ok: true, bytes, mediaType: row.media_type ?? 'application/octet-stream' };
}
