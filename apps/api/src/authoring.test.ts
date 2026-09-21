/**
 * Asking for a procedure to be brought in, from the screen.
 *
 * The API does none of the work — Decision 2 puts the browser in the worker —
 * so what is worth testing here is what can be known before a page is opened:
 * that the application is real and still in service, and that there is enough
 * of a procedure to work from. Everything else is the walk's business and
 * comes back as questions against the draft.
 */
import { strict as assert } from 'node:assert';
import { after, before, beforeEach, test } from 'node:test';
import { Client } from 'pg';
import { bringIn, finishRecording, startRecording } from './authoring.ts';
import { migrate } from './migrate.ts';

const owner = process.env['ORBIT_TEST_DATABASE_URL'] ?? `postgres://${process.env['USER']}@localhost/orbit2_test`;
let db: Client;
let applicationId: string;

const aProcedure = 'Open the pipeline and find the file for the loan number given, then record the note rate.';

before(async () => { await migrate(owner); db = new Client({ connectionString: owner }); await db.connect(); });
after(async () => { await db?.end(); });

beforeEach(async () => {
  const { rows: [a] } = await db.query<{ id: string }>(
    `INSERT INTO application (name, surface) VALUES ($1, 'browser') RETURNING id`,
    [`Underwriting ${crypto.randomUUID().slice(0, 6)}`]);
  applicationId = a!.id;
  await db.query(
    `INSERT INTO application_revision (application_id, revision, addresses, sign_in_as, credential_name)
     VALUES ($1, 1, $2, 'svc', 'PW')`,
    [applicationId, JSON.stringify([{ host: 'localhost:4101', pathPrefix: '/' }])]);
});

const asked = (over: Record<string, unknown> = {}) =>
  ({ name: 'Note rate lookup', procedure: aProcedure, applicationId,
     startPath: '/pipeline', inputs: { loanNumber: 'ML-26-04471' }, ...over });

test('a procedure is queued for a worker, not worked through here', async () => {
  const result = await bringIn(db as never, asked());
  assert.equal(result.ok, true);

  const { rows } = await db.query<{ status: string; workflow_id: string | null; procedure: string }>(
    `SELECT status, workflow_id, procedure FROM authoring_session WHERE id = $1`,
    [result.ok === true ? result.id : '']);
  assert.equal(rows[0]!.status, 'queued');
  assert.equal(rows[0]!.workflow_id, null, 'nothing exists yet — the walk has not happened');
  assert.equal(rows[0]!.procedure, aProcedure, 'kept verbatim, because every question is about these words');
});

test('an application that was retired cannot have something new pointed at it', async () => {
  // Retirement is a status rather than a delete, so the application is still
  // there to be named. Naming it is not the same as being allowed to use it.
  await db.query(`UPDATE application SET retired_at = now() WHERE id = $1`, [applicationId]);

  const result = await bringIn(db as never, asked());
  assert.equal(result.ok, false);
  assert.match(result.ok === false ? result.because : '', /retired/);
});

test('an application nobody registered is refused', async () => {
  const result = await bringIn(db as never, asked({ applicationId: crypto.randomUUID() }));
  assert.equal(result.ok, false);
  assert.match(result.ok === false ? result.because : '', /no application registered/);
});

test('a procedure too short to work from is refused, and says what is wanted', async () => {
  const result = await bringIn(db as never, asked({ procedure: 'do the thing' }));
  assert.equal(result.ok, false);
  assert.match(result.ok === false ? result.because : '', /Say a little more/);
});

test('an agent without a name is refused', async () => {
  const result = await bringIn(db as never, asked({ name: '   ' }));
  assert.equal(result.ok, false);
  assert.match(result.ok === false ? result.because : '', /needs a name/);
});

test('nothing is queued when the request is refused', async () => {
  const before = await db.query<{ n: string }>(`SELECT count(*) AS n FROM authoring_session`);
  await bringIn(db as never, asked({ procedure: 'nope' }));
  const after = await db.query<{ n: string }>(`SELECT count(*) AS n FROM authoring_session`);
  assert.equal(after.rows[0]!.n, before.rows[0]!.n);
});

test('a session cannot claim to have brought something in with nothing to show', async () => {
  // The schema carries this, not a rule somebody remembers: the same shape a
  // run has, where a finished record names its outcome.
  const result = await bringIn(db as never, asked());
  const id = result.ok === true ? result.id : '';
  await assert.rejects(
    () => db.query(`UPDATE authoring_session SET status = 'brought in' WHERE id = $1`, [id]),
    /authoring_session_says_what_came_of_it/);
});

// ── recording ─────────────────────────────────────────────────────────────

test('a recording is queued with no procedure, because the demonstration is the description', async () => {
  const result = await startRecording(db as never,
    { name: 'Shown once', applicationId, startPath: '/pipeline' });
  assert.equal(result.ok, true);

  const { rows } = await db.query<{ status: string; captured: unknown[]; finish_requested_at: string | null }>(
    `SELECT status, captured, finish_requested_at FROM recording_session WHERE id = $1`,
    [result.ok === true ? result.id : '']);
  assert.equal(rows[0]!.status, 'queued');
  assert.deepEqual(rows[0]!.captured, [], 'nothing watched yet');
  assert.equal(rows[0]!.finish_requested_at, null);
});

test('finishing is recorded rather than signalled, so it survives a restart', async () => {
  // The screen and the browser are held by two processes. A signal between
  // them would be lost if either restarted; a column is still there.
  const started = await startRecording(db as never, { name: 'Shown once', applicationId, startPath: '/' });
  const id = started.ok === true ? started.id : '';

  assert.equal((await finishRecording(db as never, id)).ok, true);
  const { rows } = await db.query<{ at: string | null }>(
    `SELECT finish_requested_at AS at FROM recording_session WHERE id = $1`, [id]);
  assert.ok(rows[0]!.at, 'the worker finds this and closes the browser');
});

test('finishing twice is refused, rather than quietly doing nothing', async () => {
  const started = await startRecording(db as never, { name: 'Shown once', applicationId, startPath: '/' });
  const id = started.ok === true ? started.id : '';
  await finishRecording(db as never, id);

  const again = await finishRecording(db as never, id);
  assert.equal(again.ok, false);
  assert.match(again.ok === false ? again.because : '', /already finished it/);
});

test('a recording against a retired application is refused like any other', async () => {
  await db.query(`UPDATE application SET retired_at = now() WHERE id = $1`, [applicationId]);
  const result = await startRecording(db as never, { name: 'Shown once', applicationId, startPath: '/' });
  assert.equal(result.ok, false);
  assert.match(result.ok === false ? result.because : '', /retired/);
});

test('a recording that captured nothing cannot claim to have brought something in', async () => {
  const started = await startRecording(db as never, { name: 'Shown once', applicationId, startPath: '/' });
  const id = started.ok === true ? started.id : '';
  await assert.rejects(
    () => db.query(`UPDATE recording_session SET status = 'brought in' WHERE id = $1`, [id]),
    /recording_session_says_what_came_of_it/);
});
