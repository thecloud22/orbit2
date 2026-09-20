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
import { dirname, join } from 'node:path';

const root = process.env['ORBIT_EVIDENCE_DIR'] ?? './data/evidence';

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
