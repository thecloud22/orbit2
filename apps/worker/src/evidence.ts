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

/** Where evidence actually lands. Exported so a test can assert it rather
 *  than reimplement the arithmetic and prove only that it can add up. */
export const evidenceRoot = root;

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
