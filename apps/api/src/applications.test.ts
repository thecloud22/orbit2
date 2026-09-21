/**
 * Registering an application, and editing one already registered.
 *
 * Decision 5's shape is what is worth proving here: registering mints the
 * first revision, and an edit updates identity and operational state in
 * place but mints a new revision rather than rewriting one — and only when
 * the edit actually changes what a revision carries, so renaming an
 * application does not mint a revision nobody asked for.
 */
import { strict as assert } from 'node:assert';
import { after, before, beforeEach, test } from 'node:test';
import { Client } from 'pg';
import { editApplication, registerApplication } from './applications.ts';
import { migrate } from './migrate.ts';

const owner = process.env['ORBIT_TEST_DATABASE_URL'] ?? `postgres://${process.env['USER']}@localhost/orbit2_test`;
let db: Client;

before(async () => { await migrate(owner); db = new Client({ connectionString: owner }); await db.connect(); });
after(async () => { await db?.end(); });

const asked = (over: Record<string, unknown> = {}) => ({
  name: 'Underwriting', surface: 'browser',
  addresses: [{ host: 'localhost:4101', pathPrefix: '/' }],
  signInAs: 'svc_underwriting', credentialName: 'UNDERWRITING_PW',
  ...over,
});

// The edit schema has no `surface` field at all — it is fixed at
// registration — so a body built for registration cannot be reused verbatim.
const edited = (over: Record<string, unknown> = {}) => {
  const { surface: _surface, ...rest } = asked(over);
  return rest;
};

test('registering mints the first revision', async () => {
  const result = await registerApplication(db as never, asked());
  assert.equal(result.ok, true);
  assert.equal(result.ok === true ? result.revision : -1, 1);

  const { rows } = await db.query<{ name: string; surface: string }>(
    `SELECT name, surface FROM application WHERE id = $1`, [result.ok === true ? result.id : '']);
  assert.equal(rows[0]!.name, 'Underwriting');
  assert.equal(rows[0]!.surface, 'browser');
});

test('a request missing a name is refused, and says so', async () => {
  const result = await registerApplication(db as never, asked({ name: '   ' }));
  assert.equal(result.ok, false);
  assert.match(result.ok === false ? result.because : '', /needs a name/);
});

test('a surface outside the closed set is refused', async () => {
  const result = await registerApplication(db as never, asked({ surface: 'mainframe' }));
  assert.equal(result.ok, false);
});

test('an unknown field is refused rather than silently dropped', async () => {
  // Decision 9: validation at a boundary rejects unknown keys rather than
  // stripping them, so a caller is never told "fine" about something ignored.
  const result = await registerApplication(db as never, asked({ actor: 'someone' }));
  assert.equal(result.ok, false);
});

test('nothing is registered when the request is refused', async () => {
  const before = await db.query<{ n: string }>(`SELECT count(*) AS n FROM application`);
  await registerApplication(db as never, asked({ addresses: [] }));
  const after = await db.query<{ n: string }>(`SELECT count(*) AS n FROM application`);
  assert.equal(after.rows[0]!.n, before.rows[0]!.n);
});

// ── editing ──────────────────────────────────────────────────────────────

let applicationId: string;

beforeEach(async () => {
  const registered = await registerApplication(db as never, asked({ name: `App ${crypto.randomUUID().slice(0, 6)}` }));
  applicationId = registered.ok === true ? registered.id : '';
});

test('renaming updates the application in place — no new revision', async () => {
  const result = await editApplication(db as never, applicationId, edited({ name: 'Underwriting, renamed' }));
  assert.equal(result.ok, true);
  assert.equal(result.ok === true ? result.revision : -1, 1, 'nothing about the revision changed');

  const { rows } = await db.query<{ name: string }>(`SELECT name FROM application WHERE id = $1`, [applicationId]);
  assert.equal(rows[0]!.name, 'Underwriting, renamed');
});

test('changing an address mints a new revision, and the old one is still there', async () => {
  const result = await editApplication(db as never, applicationId,
    edited({ addresses: [{ host: 'localhost:9999', pathPrefix: '/' }] }));
  assert.equal(result.ok, true);
  assert.equal(result.ok === true ? result.revision : -1, 2);

  const { rows } = await db.query<{ revision: number }>(
    `SELECT revision FROM application_revision WHERE application_id = $1 ORDER BY revision`, [applicationId]);
  assert.deepEqual(rows.map((r) => r.revision), [1, 2], 'the first revision is kept, never rewritten');
});

test('submitting the same connection details again mints nothing', async () => {
  const result = await editApplication(db as never, applicationId, edited());
  assert.equal(result.ok, true);
  assert.equal(result.ok === true ? result.revision : -1, 1);

  const { rows } = await db.query<{ n: string }>(
    `SELECT count(*) AS n FROM application_revision WHERE application_id = $1`, [applicationId]);
  assert.equal(rows[0]!.n, '1');
});

test('an edit is recorded on the audit trail', async () => {
  await editApplication(db as never, applicationId, edited({ name: 'Renamed for the audit trail' }));
  const { rows } = await db.query<{ act: string; object_id: string }>(
    `SELECT act, object_id FROM audit_entry WHERE object_kind = 'application' AND act = 'application edited'
      ORDER BY id DESC LIMIT 1`);
  assert.equal(rows[0]!.object_id, applicationId);
});

test('an application nobody registered cannot be edited', async () => {
  const result = await editApplication(db as never, crypto.randomUUID(), edited());
  assert.equal(result.ok, false);
  assert.equal(result.ok === false ? result.notFound : false, true);
});

test('surface is not something an edit can carry — it is fixed at registration', async () => {
  const body = asked({ surface: 'terminal' }) as Record<string, unknown>;
  const result = await editApplication(db as never, applicationId, body);
  // The edit schema has no `surface` field at all, so one arriving anyway is
  // an unknown key at the boundary, refused like any other.
  assert.equal(result.ok, false);
});
