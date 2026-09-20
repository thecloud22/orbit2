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

const root = resolve(process.env['ORBIT_EVIDENCE_DIR'] ?? './data/evidence');

export type Served =
  | { ok: true; bytes: Buffer; mediaType: string }
  | { ok: false; kind: 'notFound' | 'withheld' | 'integrityFailure'; describe: string };

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
