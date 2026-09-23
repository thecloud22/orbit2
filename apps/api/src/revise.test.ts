/**
 * The procedure edited in place (Decision 17). What is proved: a revision
 * never overwrites — the sentence as it arrived stays, and the draft reads the
 * latest; a sentence added after another sits straight after it; a withdrawn
 * sentence stays on the record, struck; a secret is refused before anything is
 * kept; every change sends the sort back and lapses a confirmation; what
 * changed since the last mapping is derived; and Orbit is asked to map only
 * that, never when nothing changed.
 */
import { strict as assert } from 'node:assert';
import { after, before, test } from 'node:test';
import { Client } from 'pg';
import { migrate } from './migrate.ts';
import { bringInToUnderstand, sentencesWithLabels } from './understanding.ts';
import { addSentence, mapChanges, pendingOf, reviseSentence, withdrawSentence } from './revise.ts';
import { inDocumentOrder } from './procedure.ts';

const owner = process.env['ORBIT_TEST_DATABASE_URL'] ?? `postgres://${process.env['USER']}@localhost/orbit2_test`;
let db: Client;
let applicationId: string;

before(async () => {
  await migrate(owner); db = new Client({ connectionString: owner }); await db.connect();
  const { rows: [a] } = await db.query<{ id: string }>(
    `INSERT INTO application (name, surface) VALUES ($1, 'browser') RETURNING id`, [`Portal ${crypto.randomUUID().slice(0, 6)}`]);
  applicationId = a!.id;
  await db.query(`INSERT INTO application_revision (application_id, revision, addresses, sign_in_as, credential_name)
    VALUES ($1, 1, $2, 'svc', 'PW')`, [applicationId, JSON.stringify([{ host: 'localhost:4101', pathPrefix: '/' }])]);
});
after(async () => { await db?.end(); });

const PROCEDURE = 'Sign in to the portal. Open the loan file. If the loan-to-value is over 80%, attach the PMI condition.';

const label = (W: string, n: number, l: string) => db.query(`INSERT INTO sentence_label (sentence_id, label, reason, basis, given_by)
  SELECT s.id, $3, 'r', 'stated', 'model' FROM procedure_sentence s JOIN procedure_part p ON p.id = s.part_id
   WHERE p.workflow_id = $1 AND p.key = '1' AND s.n = $2`, [W, n, l]);

/** A procedure brought in, sorted, and drafted once: the state editing starts from. */
async function drafted() {
  const brought = await bringInToUnderstand(db as never, { name: 'Edits', procedure: PROCEDURE, applicationId, startPath: '/', inputs: {} });
  assert.ok(brought.ok);
  const W = brought.id;
  for (const [n, l] of [[1, 'task'], [2, 'task'], [3, 'rule']] as const) await label(W, n, l);
  const { rows: [s] } = await db.query<{ id: string }>(
    `INSERT INTO authoring_session (name, procedure, application_id, start_path, into_workflow_id, status, workflow_id, ended_at)
     VALUES ('Edits', 'x', $1, '/', $2, 'brought in', $2, now()) RETURNING id`, [applicationId, W]);
  await db.query(`UPDATE understanding SET status = 'sorted', confirmed_at = now(), session_id = $2 WHERE workflow_id = $1`, [W, s!.id]);
  await db.query(`UPDATE workflow SET confirmed_at = now() WHERE id = $1`, [W]);
  await db.query(`INSERT INTO mapping (workflow_id, session_id, mapped_at) VALUES ($1, $2, clock_timestamp())`, [W, s!.id]);
  return W;
}

test('a revision is kept beside what the sentence arrived as', async () => {
  const W = await drafted();
  assert.deepEqual(await reviseSentence(db as never, W, { sentence: '1.3', text: 'If the loan-to-value is over 85%, attach the PMI condition.' }), { ok: true });
  const s = (await sentencesWithLabels(db, W)).find((x) => x.number === '1.3')!;
  assert.equal(s.text, 'If the loan-to-value is over 85%, attach the PMI condition.');
  assert.equal(s.was, 'If the loan-to-value is over 80%, attach the PMI condition.');
  assert.equal(s.labelCurrent, false, 'its label described the old words');
  const { rows: [u] } = await db.query(`SELECT status, confirmed_at FROM understanding WHERE workflow_id = $1`, [W]);
  assert.equal(u!.status, 'queued', 'what changed goes back to the sort');
  assert.ok(u!.confirmed_at, 'the draft stays drafted');
  const { rows: [w] } = await db.query(`SELECT confirmed_at FROM workflow WHERE id = $1`, [W]);
  assert.equal(w!.confirmed_at, null, 'a confirmation lapses');
  await assert.rejects(db.query(`UPDATE sentence_revision SET text = 'x' WHERE sentence_id IS NOT NULL`), 'a revision is never edited');
});

test('what changed since the last mapping is what Orbit maps', async () => {
  const W = await drafted();
  assert.deepEqual(await pendingOf(db, W), []);
  const nothing = await mapChanges(db as never, W);
  assert.equal(nothing.ok, false);
  await reviseSentence(db as never, W, { sentence: '1.3', text: 'If the loan-to-value is over 85%, attach the PMI condition.' });
  assert.deepEqual(await pendingOf(db, W), ['1.3']);
  const sorting = await mapChanges(db as never, W);
  assert.equal(sorting.ok, false, 'not while the sort is at work');
  await label(W, 3, 'rule');
  await db.query(`UPDATE understanding SET status = 'sorted' WHERE workflow_id = $1`, [W]);
  const queued = await mapChanges(db as never, W);
  assert.ok(queued.ok, queued.ok ? '' : queued.because);
  const { rows: [s] } = await db.query(`SELECT scope FROM authoring_session WHERE id = $1`, [queued.id]);
  assert.deepEqual(s!.scope, ['1.3'], 'only what changed');
});

test('an added sentence sits after the one it was added after, and a withdrawn one stays, struck', async () => {
  const W = await drafted();
  const added = await addSentence(db as never, W, { after: '1.1', text: 'Check the queue first.' });
  assert.ok(added.ok);
  const order = (await sentencesWithLabels(db, W)).map((s) => s.number);
  assert.deepEqual(order, ['1.1', 'A.1', '1.2', '1.3']);
  await db.query(`UPDATE understanding SET status = 'sorted' WHERE workflow_id = $1`, [W]);
  assert.deepEqual(await withdrawSentence(db as never, W, { sentence: '1.2' }), { ok: true });
  const struck = (await sentencesWithLabels(db, W)).find((s) => s.number === '1.2')!;
  assert.equal(struck.withdrawn, true);
  assert.equal(struck.text, 'Open the loan file.', 'the words stay on the record');
});

test('a secret is refused before anything is kept', async () => {
  const W = await drafted();
  const refused = await reviseSentence(db as never, W, { sentence: '1.1', text: 'Sign in; the password is Hunter2Hunter2!' });
  assert.equal(refused.ok, false);
  const { rows } = await db.query(`SELECT 1 FROM sentence_revision r JOIN procedure_sentence s ON s.id = r.sentence_id
    JOIN procedure_part p ON p.id = s.part_id WHERE p.workflow_id = $1`, [W]);
  assert.equal(rows.length, 0);
});

test('document order places each added sentence, and keeps the rest in part order', () => {
  const rows = [
    { number: '1.1', part: '1' }, { number: '1.2', part: '1' }, { number: 'A.1', part: 'A', after: '1.1' },
    { number: 'B.1', part: 'B', after: '1.1' }, { number: 'C.1', part: 'C', after: 'A.1' }, { number: 'D.1', part: 'D' },
  ];
  assert.deepEqual(inDocumentOrder(rows).map((r) => r.number), ['1.1', 'A.1', 'C.1', 'B.1', '1.2', 'D.1']);
});
