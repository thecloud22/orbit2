/**
 * Artefacts are content-addressed: the digest is the address. Local disk now,
 * S3 later, and the driver is all that changes (Decision 4).
 *
 * Bytes enter only through `capture`. The store's write is not exported, so
 * there is no second route by which something unredacted could reach it — and
 * when redaction arrives it goes here, in one place, rather than at every
 * call site.
 */
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

/**
 * One store, wherever the process happens to be started from.
 *
 * This defaulted to './data/evidence', which is relative to the working
 * directory — so the worker wrote evidence under apps/worker and the API
 * looked for it under apps/api, and every screenshot a run captured was
 * missing by the time anyone tried to look at it. Anchoring the default to
 * this file's location instead of the caller's cwd makes the two agree by
 * construction rather than by everyone remembering to set the variable.
 */
const root = resolve(process.env['ORBIT_EVIDENCE_DIR']
  ?? join(import.meta.dirname, '..', '..', '..', 'data', 'evidence'));

export interface Captured { digest: string; bytes: number; mediaType: string }

export async function capture(bytes: Buffer, mediaType: string): Promise<Captured> {
  const digest = `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
  // Sharded by the first two characters of the hash, so one directory never
  // holds a million files.
  const path = join(root, digest.slice(7, 9), digest.slice(9));
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, bytes);
  return { digest, bytes: bytes.length, mediaType };
}
