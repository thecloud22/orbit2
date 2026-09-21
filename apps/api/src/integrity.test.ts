/**
 * Acceptance criterion 10, and §12's sentence behind it: "Orbit verifies an
 * artefact against its digest when serving it, and reports a mismatch as an
 * integrity failure rather than serving content that may have changed."
 *
 * The property worth proving is not that the check exists. It is that altered
 * bytes are NOT returned — a check that logs and serves anyway is worse than
 * no check, because it looks like one.
 */
import { strict as assert } from 'node:assert';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { after, before, test } from 'node:test';
import { Client } from 'pg';
import { migrate } from './migrate.ts';
import { serveArtefact } from './artefacts.ts';

const owner = process.env['ORBIT_TEST_DATABASE_URL'] ?? `postgres://${process.env['USER']}@localhost/orbit2_test`;
// Anchored the way artefacts.ts anchors it, not to the working directory.
// They disagreed: this wrote into apps/api/data/evidence and the code read
// from the repository root, so the test proved that a file it had just
// written could not be found — which is a true statement about two different
// directories and nothing about integrity.
const root = resolve(process.env['ORBIT_EVIDENCE_DIR']
  ?? join(import.meta.dirname, '..', '..', '..', 'data', 'evidence'));
let db: Client;
let honest: string;
let tampered: string;
let withheld: string;

/** Writes bytes at the address their digest gives them, as capture does. */
async function store(bytes: Buffer): Promise<string> {
  const digest = `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
  const hex = digest.slice(7);
  await mkdir(join(root, hex.slice(0, 2)), { recursive: true });
  await writeFile(join(root, hex.slice(0, 2), hex.slice(2)), bytes);
  return digest;
}

before(async () => {
  await migrate(owner);
  db = new Client({ connectionString: owner });
  await db.connect();
  const { rows: [w] } = await db.query<{ id: string }>(`INSERT INTO workflow (name) VALUES ('I') RETURNING id`);
  const { rows: [v] } = await db.query<{ id: string }>(
    `INSERT INTO workflow_version (workflow_id, version, body, digest, outcomes, declared_inputs, applications)
     VALUES ($1, 1, '{}', 'sha256:i', '[]', '[]', '[]') RETURNING id`, [w!.id]);
  const { rows: [r] } = await db.query<{ id: string }>(
    `INSERT INTO run (version_id, reference, status, inputs)
     VALUES ($1, 'I-' || substr(gen_random_uuid()::text,1,6), 'running', '{}') RETURNING id`, [v!.id]);

  const add = async (digest: string | null, why: string | null) => {
    const { rows: [a] } = await db.query<{ id: string }>(
      `INSERT INTO artefact (run_id, kind, media_type, bytes, digest, withheld, withheld_why)
       VALUES ($1, 'screenshot', 'image/png', 4, $2, $3, $4) RETURNING id`,
      [r!.id, digest, digest === null, why]);
    return a!.id;
  };

  honest = await add(await store(Buffer.from('good')), null);

  // Captured honestly, and then the file at that address is changed — which
  // is how this actually happens: nothing edits the record, something edits
  // the bytes.
  const original = Buffer.from('captured at the time');
  const digest = await store(original);
  tampered = await add(digest, null);
  const hex = digest.slice(7);
  await writeFile(join(root, hex.slice(0, 2), hex.slice(2)), Buffer.from('changed afterwards'));

  withheld = await add(null, 'a secret was entered into a field that could not be confirmed masked');
});
after(async () => { await db?.end(); });

test('an artefact that matches its digest is served', async () => {
  const served = await serveArtefact(honest, db);
  assert.equal(served.ok, true);
  assert.equal(served.bytes.toString(), 'good');
});

test('altered bytes are refused, and are not returned', async () => {
  const served = await serveArtefact(tampered, db);
  assert.equal(served.ok, false);
  assert.equal(served.kind, 'integrityFailure');
  // The point of the whole exercise: nothing to render, nothing to read, no
  // way for a caller to get the changed content by ignoring a flag.
  assert.equal('bytes' in served, false);
  assert.match(served.describe, /does not match the digest/);
});

test('a withheld artefact says why, and is not an error', async () => {
  const served = await serveArtefact(withheld, db);
  assert.equal(served.ok, false);
  assert.equal(served.kind, 'withheld');
  assert.match(served.describe, /could not be confirmed masked/);
});

test('an artefact recorded but absent from the store says so, rather than nothing', async () => {
  const { rows: [r] } = await db.query<{ id: string }>(`SELECT run_id AS id FROM artefact LIMIT 1`);
  const { rows: [ghost] } = await db.query<{ id: string }>(
    `INSERT INTO artefact (run_id, kind, digest) VALUES ($1, 'screenshot', 'sha256:' || repeat('a', 64)) RETURNING id`,
    [r!.id]);
  const served = await serveArtefact(ghost!.id, db);
  assert.equal(served.ok, false);
  assert.equal(served.kind, 'notFound');
  assert.match(served.describe, /recorded but its bytes are not/);
});
