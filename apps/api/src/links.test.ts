/**
 * Values named in the author's words (Decision 20). What is proved: a link is
 * kept beside the sentence and never in it; a phrase that is not there, or is
 * there twice, is refused and says which; only a task or a rule takes one; a
 * link is a change like a label, so the rules are tabled again and the
 * sentence waits to be mapped; a link is never edited; the draft shows the
 * author's links and Orbit's guesses; and a revision that drops the phrase
 * drops the link.
 */
import { strict as assert } from 'node:assert';
import { after, before, test } from 'node:test';
import { Client } from 'pg';
import { migrate } from './migrate.ts';
import { bringInToUnderstand, sentencesWithLabels } from './understanding.ts';
import { addSentence, linkValue, pendingOf, reviseSentence } from './revise.ts';
import { draftLinks } from './links.ts';

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

// Scenario 2's words: the program is named once as "the loan program", then as "the program".
const PROCEDURE = 'Open the loan file. Read the loan program and the loan amount. '
  + 'If the loan amount is over $806,500 and the program is not jumbo, refer the file. Do not attach conditions to a referred file.';

const label = (W: string, n: number, l: string) => db.query(`INSERT INTO sentence_label (sentence_id, label, reason, basis, given_by)
  SELECT s.id, $3, 'r', 'stated', 'model' FROM procedure_sentence s JOIN procedure_part p ON p.id = s.part_id
   WHERE p.workflow_id = $1 AND p.key = '1' AND s.n = $2`, [W, n, l]);

async function drafted() {
  const brought = await bringInToUnderstand(db as never, { name: 'Links', procedure: PROCEDURE, applicationId, startPath: '/', inputs: {} });
  assert.ok(brought.ok);
  const W = brought.id;
  for (const [n, l] of [[1, 'task'], [2, 'task'], [3, 'rule'], [4, 'background']] as const) await label(W, n, l);
  const { rows: [s] } = await db.query<{ id: string }>(
    `INSERT INTO authoring_session (name, procedure, application_id, start_path, into_workflow_id, status, workflow_id, ended_at)
     VALUES ('Links', 'x', $1, '/', $2, 'brought in', $2, now()) RETURNING id`, [applicationId, W]);
  await db.query(`UPDATE understanding SET status = 'sorted', confirmed_at = now(), session_id = $2 WHERE workflow_id = $1`, [W, s!.id]);
  await db.query(`UPDATE workflow SET confirmed_at = now() WHERE id = $1`, [W]);
  await db.query(`INSERT INTO mapping (workflow_id, session_id, mapped_at) VALUES ($1, $2, clock_timestamp())`, [W, s!.id]);
  return W;
}

test('a value named in a rule is kept beside it, and is a change like a label', async () => {
  const W = await drafted();
  const before = (await sentencesWithLabels(db, W)).find((x) => x.number === '1.3')!.text;
  assert.deepEqual(await linkValue(db as never, W, { sentence: '1.3', phrase: 'the program', value: 'loanProgram' }), { ok: true });
  assert.equal((await sentencesWithLabels(db, W)).find((x) => x.number === '1.3')!.text, before, 'the words are not changed');
  const { rows: [u] } = await db.query(`SELECT status FROM understanding WHERE workflow_id = $1`, [W]);
  assert.equal(u!.status, 'queued', 'the rules are tabled again');
  const { rows: [w] } = await db.query(`SELECT confirmed_at FROM workflow WHERE id = $1`, [W]);
  assert.equal(w!.confirmed_at, null, 'a confirmation lapses');
  assert.deepEqual(await pendingOf(db, W), ['1.3'], 'the sentence waits to be mapped');
  await assert.rejects(db.query(`UPDATE value_link SET value = 'x' WHERE sentence_id IS NOT NULL`), 'a link is never edited');
});

test('a phrase not there, there twice, or in a sentence that names no value is refused, saying which', async () => {
  const W = await drafted();
  const refused = async (body: unknown) => { const r = await linkValue(db as never, W, body); assert.equal(r.ok, false); return r.ok ? '' : r.because; };
  assert.match(await refused({ sentence: '1.3', phrase: 'the loan programme', value: 'loanProgram' }), /is not in 1\.3/);
  assert.match(await refused({ sentence: '1.2', phrase: 'the loan', value: 'loanAmount' }), /is in 1\.2 more than once/);
  assert.match(await refused({ sentence: '1.2', phrase: 'loan', value: 'loanAmount' }), /more than once/);
  assert.match(await refused({ sentence: '1.4', phrase: 'a referred file', value: 'referred' }), /Nothing is read or compared in 1\.4/);
  assert.match(await refused({ sentence: '1.3', phrase: 'the program', value: 'Loan Program' }), /a name like creditScore/);
  assert.match(await refused({ sentence: '1.9', phrase: 'x', value: 'x' }), /no sentence 1\.9/);
  const { rows: [u] } = await db.query(`SELECT status FROM understanding WHERE workflow_id = $1`, [W]);
  assert.equal(u!.status, 'sorted', 'nothing refused was a change');
});

test("the draft shows the author's links and Orbit's guesses, and a revision that drops the phrase drops the link", async () => {
  const W = await drafted();
  await linkValue(db as never, W, { sentence: '1.3', phrase: 'the program', value: 'loanProgram' });
  await db.query(`UPDATE understanding SET status = 'sorted' WHERE workflow_id = $1`, [W]);
  await linkValue(db as never, W, { sentence: '1.2', phrase: 'the loan amount', value: null });
  await db.query(`UPDATE understanding SET status = 'sorted' WHERE workflow_id = $1`, [W]);
  const steps = [{ kind: 'read', from_sentence: '1.2', declares: { produces: { name: 'loanProgram', label: 'Loan program' } } }];
  const links = async () => draftLinks(db, W, { sentences: await sentencesWithLabels(db, W), tables: [], steps });
  assert.deepEqual(await links(), [
    { sentence: '1.2', phrase: 'the loan program', value: 'loanProgram', by: 'orbit' },
    { sentence: '1.2', phrase: 'the loan amount', value: null, by: 'author' },
    { sentence: '1.3', phrase: 'the program', value: 'loanProgram', by: 'author' },
  ]);
  await reviseSentence(db as never, W, { sentence: '1.3', text: 'If the loan amount is over $806,500 and the loan type is not jumbo, refer the file.' });
  assert.deepEqual((await links()).filter((l) => l.sentence === '1.3'), [], 'the phrase is gone, and its link with it');
});

test('a value named while writing is kept with the words, in the same change', async () => {
  const W = await drafted();
  const text = 'If the loan amount is over $806,500 and the loan program is not jumbo, refer the file.';
  const bad = await reviseSentence(db as never, W, { sentence: '1.3', text, links: [{ phrase: 'the program', value: 'loanProgram' }] });
  assert.equal(bad.ok, false, 'words that are not in the new text name nothing');
  assert.deepEqual(await reviseSentence(db as never, W, { sentence: '1.3', text,
    links: [{ phrase: 'the loan program', value: 'loanProgram' }] }), { ok: true });
  await db.query(`UPDATE understanding SET status = 'sorted' WHERE workflow_id = $1`, [W]);
  const added = await addSentence(db as never, W, { after: '1.3', text: 'If the credit score is below 620, decline the file.',
    links: [{ phrase: 'the credit score', value: 'creditScore' }] });
  assert.ok(added.ok);
  const { rows } = await db.query<{ phrase: string; value: string }>(
    `SELECT v.phrase, v.value FROM value_link v JOIN procedure_sentence s ON s.id = v.sentence_id JOIN procedure_part p ON p.id = s.part_id
      WHERE p.workflow_id = $1 ORDER BY v.seq`, [W]);
  assert.deepEqual(rows, [{ phrase: 'the loan program', value: 'loanProgram' }, { phrase: 'the credit score', value: 'creditScore' }]);
});

test("Orbit's guesses are confirmed together, as one change, or none of them is", async () => {
  const W = await drafted();
  const none = await linkValue(db as never, W, { links: [
    { sentence: '1.2', phrase: 'the loan program', value: 'loanProgram' },
    { sentence: '1.3', phrase: 'the loan programme', value: 'loanProgram' }] });
  assert.equal(none.ok, false);
  const { rows: [n] } = await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM value_link v JOIN procedure_sentence s ON s.id = v.sentence_id
    JOIN procedure_part p ON p.id = s.part_id WHERE p.workflow_id = $1`, [W]);
  assert.equal(n!.n, 0, 'one refused, none kept');
  assert.deepEqual(await linkValue(db as never, W, { links: [
    { sentence: '1.2', phrase: 'the loan program', value: 'loanProgram' },
    { sentence: '1.3', phrase: 'the program', value: 'loanProgram' }] }), { ok: true });
});
