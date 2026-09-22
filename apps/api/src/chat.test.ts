/**
 * What the chat decides before any model sees a message: a secret is neither
 * sent nor kept, an address outside the application is not sent, and the
 * chat is closed once the sort has been drafted from.
 */
import { strict as assert } from 'node:assert';
import { after, before, beforeEach, test } from 'node:test';
import { Client } from 'pg';
import { migrate } from './migrate.ts';
import { recordLabelling } from './procedure.ts';
import { bringInToUnderstand } from './understanding.ts';
import { sendMessage, takeOffer } from './chat.ts';

const owner = process.env['ORBIT_TEST_DATABASE_URL'] ?? `postgres://${process.env['USER']}@localhost/orbit2_test`;
let db: Client;
let workflowId: string;

before(async () => { await migrate(owner); db = new Client({ connectionString: owner }); await db.connect(); });
after(async () => { await db?.end(); });

beforeEach(async () => {
  const { rows: [a] } = await db.query<{ id: string }>(
    `INSERT INTO application (name, surface) VALUES ($1, 'browser') RETURNING id`, [`Claims ${crypto.randomUUID().slice(0, 6)}`]);
  await db.query(`INSERT INTO application_revision (application_id, revision, addresses) VALUES ($1, 1, $2)`,
    [a!.id, JSON.stringify([{ host: 'localhost:4101', pathPrefix: '/' }])]);
  const r = await bringInToUnderstand(db as never, {
    name: 'Chat', procedure: 'Log into Claims Central. Search for the claim.', applicationId: a!.id, startPath: '/', inputs: {} });
  assert.ok(r.ok);
  workflowId = r.id;
  await recordLabelling(db, workflowId, '1', [
    { sentence: '1.1', label: 'task', reason: 't', basis: 'stated' },
    { sentence: '1.2', label: 'task', reason: 't', basis: 'stated' }], 'model');
  await db.query(`UPDATE understanding SET status = 'sorted' WHERE workflow_id = $1`, [workflowId]);
});

const messages = async () => (await db.query<{ said_by: string; text: string | null; state: string }>(
  `SELECT said_by, text, state FROM chat_message WHERE workflow_id = $1 ORDER BY seq`, [workflowId])).rows;

test('an ordinary message waits for the worker', async () => {
  const sent = await sendMessage(db as never, workflowId, { text: 'Sentence 2 is for a person' });
  assert.deepEqual(sent.ok && sent.state, 'waiting');
  assert.equal((await sendMessage(db as never, workflowId, { text: 'And another' })).ok, false, 'one at a time');
});

test('a secret is neither sent nor kept', async () => {
  const sent = await sendMessage(db as never, workflowId, { text: "Here's the login: jsmith / hunter2" });
  assert.deepEqual(sent.ok && sent.state, 'blocked');
  const all = await messages();
  assert.deepEqual(all.map((m) => [m.said_by, m.state]), [['author', 'blocked'], ['orbit', 'refused']]);
  assert.equal(all[0]!.text, null, 'nothing of what it said');
  assert.ok(!JSON.stringify(all).includes('hunter2'));
});

test('an address outside the application is refused and never waits for a model', async () => {
  const sent = await sendMessage(db as never, workflowId, { text: 'Check the price on https://amazon.com' });
  assert.deepEqual(sent.ok && sent.state, 'answered');
  assert.match((await messages())[1]!.text ?? '', /not sent to Orbit's model/);
});

test('the chat is closed once the sort has been drafted from', async () => {
  await db.query(`INSERT INTO authoring_session (id, name, procedure, application_id, start_path)
    SELECT gen_random_uuid(), 'x', 'y', application_id, '/' FROM understanding WHERE workflow_id = $1`, [workflowId]);
  await db.query(`UPDATE understanding SET confirmed_at = now(),
    session_id = (SELECT id FROM authoring_session ORDER BY queued_at DESC LIMIT 1) WHERE workflow_id = $1`, [workflowId]);
  const sent = await sendMessage(db as never, workflowId, { text: 'Sentence 2 is for a person' });
  assert.match(sent.ok ? '' : sent.because, /chat is closed/);
});

test('taking the offer adds the author\'s words as work for a person', async () => {
  const sent = await sendMessage(db as never, workflowId, { text: 'Update the enquiry log when done' });
  assert.ok(sent.ok);
  // What the worker does with a request that would change data.
  await db.query(`UPDATE chat_message SET state = 'answered' WHERE id = $1`, [sent.id]);
  const { rows: [offer] } = await db.query<{ id: string }>(
    `INSERT INTO chat_message (workflow_id, said_by, text, state, outcome, answers)
     VALUES ($1, 'orbit', 'offer', 'offered', '{"offer":"forAPerson"}', $2) RETURNING id`, [workflowId, sent.id]);
  const taken = await takeOffer(db as never, workflowId, { messageId: offer!.id });
  assert.equal(taken.ok, true);
  const { rows } = await db.query<{ text: string; label: string; given_by: string }>(
    `SELECT s.text, l.label, l.given_by FROM procedure_sentence s JOIN procedure_part p ON p.id = s.part_id
       JOIN sentence_label l ON l.sentence_id = s.id WHERE p.workflow_id = $1 AND p.key = 'A'`, [workflowId]);
  assert.deepEqual(rows, [{ text: 'Update the enquiry log when done', label: 'forAPerson', given_by: 'author' }]);
  assert.equal((await takeOffer(db as never, workflowId, { messageId: offer!.id })).ok, false, 'once');
});
