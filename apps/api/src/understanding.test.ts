/**
 * Understanding before drafting. What is proved: bringing a procedure in makes
 * the draft and its sentences at once, and drafts nothing; a person may
 * relabel only while the sort is open; and confirmation refuses while any
 * sentence is unplaced, then gives the walk only the sentences Orbit does,
 * into this same draft, writing down what it leaves to people.
 */
import { strict as assert } from 'node:assert';
import { after, before, beforeEach, describe, test } from 'node:test';
import { Client } from 'pg';
import { migrate } from './migrate.ts';
import { recordLabelling } from './procedure.ts';
import { addNextPart, bringInToUnderstand, confirmUnderstanding, forTheWalk, relabel, setMoreToCome, understandingOf } from './understanding.ts';

const owner = process.env['ORBIT_TEST_DATABASE_URL'] ?? `postgres://${process.env['USER']}@localhost/orbit2_test`;
let db: Client;
let applicationId: string;

const PROCEDURE = [
  'Claim status enquiry',
  '',
  'Log into Claims Central. Search for the claim using the number the requester gave.',
  'If there is no such claim, say so. Phone the requester if they sound upset.',
  'Do not change the claim.',
].join('\n');
// 1.1 heading · 1.2 log in · 1.3 search · 1.4 if none · 1.5 phone · 1.6 do not change
const SORTED = { '1.1': 'background', '1.2': 'task', '1.3': 'task', '1.4': 'rule', '1.5': 'forAPerson', '1.6': 'wontDo' };

before(async () => { await migrate(owner); db = new Client({ connectionString: owner }); await db.connect(); });
after(async () => { await db?.end(); });

beforeEach(async () => {
  const { rows: [a] } = await db.query<{ id: string }>(
    `INSERT INTO application (name, surface) VALUES ($1, 'browser') RETURNING id`,
    [`Claims Central ${crypto.randomUUID().slice(0, 6)}`]);
  applicationId = a!.id;
  await db.query(
    `INSERT INTO application_revision (application_id, revision, addresses, sign_in_as, credential_name)
     VALUES ($1, 1, $2, 'svc', 'PW')`,
    [applicationId, JSON.stringify([{ host: 'localhost:4101', pathPrefix: '/' }])]);
});

const broughtIn = async () => {
  const result = await bringInToUnderstand(db as never, {
    name: 'Claim status', procedure: PROCEDURE, applicationId, startPath: '/', inputs: { claim: 'CL-1001' } });
  assert.ok(result.ok, result.ok ? '' : result.because);
  return result.id;
};

/** What a worker does once the model has answered. */
const sorted = async (workflowId: string, labels: Record<string, string> = SORTED) => {
  const answer = Object.entries(labels).map(([sentence, label]) => ({ sentence, label, reason: 'test', basis: 'stated' }));
  const kept = await recordLabelling(db, workflowId, '1', answer, 'model');
  assert.equal(kept.ok, true);
  await db.query(`UPDATE understanding SET status = 'sorted', sorted_at = now() WHERE workflow_id = $1`, [workflowId]);
};

describe('bringing a procedure in to be understood', () => {
  test('makes the draft and its sentences, queued to sort, with no steps', async () => {
    const id = await broughtIn();
    const u = await understandingOf(db, id);
    assert.equal(u?.status, 'queued');
    assert.equal(u?.sentences.length, 6);
    assert.equal(u?.coverage.placed, 0);
    const { rows: [w] } = await db.query<{ procedure: string; steps: number }>(
      `SELECT procedure, (SELECT count(*)::int FROM workflow_step WHERE workflow_id = w.id) AS steps
         FROM workflow w WHERE id = $1`, [id]);
    assert.equal(w!.procedure, PROCEDURE, 'the whole text, as written');
    assert.equal(w!.steps, 0, 'nothing is drafted before the sort is confirmed');
  });

  test('refuses an application that is retired', async () => {
    await db.query(`UPDATE application SET retired_at = now() WHERE id = $1`, [applicationId]);
    const result = await bringInToUnderstand(db as never, {
      name: 'x', procedure: PROCEDURE, applicationId, startPath: '/', inputs: {} });
    assert.equal(result.ok, false);
  });
});

describe('relabelling', () => {
  test('waits for the sort, then adds a row the reading prefers', async () => {
    const id = await broughtIn();
    assert.equal((await relabel(db, id, { sentence: '1.5', label: 'task' })).ok, false, 'not sorted yet');
    await sorted(id);
    assert.deepEqual(await relabel(db, id, { sentence: '1.5', label: 'task', reason: 'our system logs calls' }), { ok: true });
    const u = await understandingOf(db, id);
    const s = u!.sentences.find((x) => x.number === '1.5')!;
    assert.equal(s.label, 'task');
    assert.equal(s.givenBy, 'author');
    assert.equal(s.reason, 'our system logs calls');
  });

  test('refuses a sentence that does not exist, or a label outside the five', async () => {
    const id = await broughtIn();
    await sorted(id);
    assert.equal((await relabel(db, id, { sentence: '1.9', label: 'task' })).ok, false);
    assert.equal((await relabel(db, id, { sentence: '1.2', label: 'maybe' })).ok, false);
  });
});

describe('confirming the sort', () => {
  test('is refused before the sort has finished', async () => {
    const id = await broughtIn();
    assert.equal((await confirmUnderstanding(db as never, id)).ok, false);
  });

  test('is refused while any sentence has no label, and names it', async () => {
    const id = await broughtIn();
    // A labelling must place every sentence of a part, so the gap is made the
    // way it would arrive: a part added after the sort.
    await sorted(id);
    await db.query(
      `INSERT INTO procedure_part (workflow_id, key, source, body) VALUES ($1, 'A', 'author', 'Check the payment history.')`, [id]);
    await db.query(
      `INSERT INTO procedure_sentence (part_id, n, text, kind, start_at, end_at)
       SELECT id, 1, 'Check the payment history.', 'prose', 0, 26 FROM procedure_part WHERE workflow_id = $1 AND key = 'A'`, [id]);
    const result = await confirmUnderstanding(db as never, id);
    assert.equal(result.ok, false);
    assert.match(result.ok ? '' : result.because, /Sentence A\.1 has no label yet/);
  });

  test('is refused when nothing is left for Orbit to do', async () => {
    const id = await broughtIn();
    await sorted(id, Object.fromEntries(Object.keys(SORTED).map((n) => [n, 'background'])));
    const result = await confirmUnderstanding(db as never, id);
    assert.match(result.ok ? '' : result.because, /nothing for Orbit to do/);
  });

  test('queues the walk into this draft, with only the sentences Orbit does', async () => {
    const id = await broughtIn();
    await sorted(id);
    const result = await confirmUnderstanding(db as never, id);
    assert.ok(result.ok);

    const { rows: [s] } = await db.query<{ procedure: string; into_workflow_id: string; status: string; inputs: unknown }>(
      `SELECT procedure, into_workflow_id, status, inputs FROM authoring_session WHERE id = $1`, [result.id]);
    assert.equal(s!.into_workflow_id, id);
    assert.equal(s!.status, 'queued');
    assert.deepEqual(s!.inputs, { claim: 'CL-1001' });
    assert.equal(s!.procedure, [
      'Log into Claims Central.', 'Search for the claim using the number the requester gave.', 'If there is no such claim, say so.',
    ].join('\n'), 'the tasks and the rule, in order and verbatim — no heading, no phone call, no prohibition');

    const { rows: notes } = await db.query<{ body: string; resolved_at: string | null }>(
      `SELECT body, resolved_at FROM workflow_note WHERE workflow_id = $1 ORDER BY body`, [id]);
    assert.deepEqual(notes.map((n) => n.body), [
      'Sentence 1.5: "Phone the requester if they sound upset."',
      'Sentence 1.6: "Do not change the claim."',
    ]);
    assert.ok(notes.every((n) => n.resolved_at), 'what the author confirmed blocks nothing');

    assert.equal((await relabel(db, id, { sentence: '1.2', label: 'background' })).ok, false,
      'once drafted from, the sort cannot change underneath the steps');
    assert.equal((await confirmUnderstanding(db as never, id)).ok, false, 'confirmed once');
  });
});

test('the walk is given task and rule sentences only', () => {
  const s = (number: string, label: string | null, text: string) =>
    ({ number, part: '1', n: 1, text, kind: 'prose', label, reason: null, basis: null, givenBy: null }) as never;
  assert.equal(forTheWalk([s('1.1', 'background', 'Intro.'), s('1.2', 'task', 'Log in.'),
    s('1.3', 'forAPerson', 'Call them.'), s('1.4', 'rule', 'If none, say so.'), s('1.5', 'wontDo', 'Never delete.')]),
  'Log in.\nIf none, say so.');
});

describe('a procedure brought in parts', () => {
  const inParts = async () => {
    const result = await bringInToUnderstand(db as never, {
      name: 'In parts', procedure: 'Log into Claims Central. Search for the claim. If it was reopened within 30 days of',
      applicationId, startPath: '/', inputs: {}, moreToCome: true });
    assert.ok(result.ok);
    return result.id;
  };
  const sortAll = async (id: string, part: string, n: number) => {
    const answer = Array.from({ length: n }, (_, i) => ({ sentence: `${part}.${i + 1}`, label: 'task', reason: 't', basis: 'stated' }));
    assert.equal((await recordLabelling(db, id, part, answer, 'model')).ok, true);
    await db.query(`UPDATE understanding SET status = 'sorted', sorted_at = now() WHERE workflow_id = $1`, [id]);
  };

  test('says where a part stops mid-sentence, and confirming waits for the rest', async () => {
    const id = await inParts();
    const u = await understandingOf(db, id);
    assert.equal(u!.more_to_come, true);
    assert.deepEqual(u!.sentences.filter((s) => s.unterminated).map((s) => s.number), ['1.3']);
    await sortAll(id, '1', 3);
    const refused = await confirmUnderstanding(db as never, id);
    assert.match(refused.ok ? '' : refused.because, /more of the procedure is to come/);
  });

  test('the next part is numbered 2, re-queued for sorting, and leaves part 1 as it was', async () => {
    const id = await inParts();
    assert.equal((await addNextPart(db as never, id, { body: 'the last payment. Pass it to the claims team.' })).ok, false,
      'not while part 1 is still being sorted');
    await sortAll(id, '1', 3);
    const before_ = (await understandingOf(db, id))!.sentences;
    assert.deepEqual(await addNextPart(db as never, id, { body: 'the last payment. Pass it to the claims team.' }),
      { ok: true, id });
    const u = (await understandingOf(db, id))!;
    assert.equal(u.status, 'queued');
    assert.equal(u.more_to_come, false, 'this part was the last');
    assert.deepEqual(u.parts.map((p) => p.key), ['1', '2']);
    assert.deepEqual(u.sentences.slice(0, 3), before_);
    assert.deepEqual(u.sentences.slice(3).map((s) => [s.number, s.label]), [['2.1', null], ['2.2', null]]);
  });

  test('that is all of it, and then it can be confirmed', async () => {
    const id = await inParts();
    await sortAll(id, '1', 3);
    assert.deepEqual(await setMoreToCome(db, id, { moreToCome: false }), { ok: true });
    assert.equal((await confirmUnderstanding(db as never, id)).ok, true);
    assert.equal((await addNextPart(db as never, id, { body: 'Another part.' })).ok, false, 'not after it was drafted from');
  });
});
