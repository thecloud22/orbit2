/**
 * The procedure editor's read of a draft (plan R2–R5, R7). What is proved: the
 * document is laid out as the author wrote it — a heading stands alone, a list
 * item starts a block, and a sentence on the same line or the next carries on
 * the block before it — and every step reaches the picture of the turn that
 * made it, with the element's box.
 */
import { strict as assert } from 'node:assert';
import { after, before, test } from 'node:test';
import { Client } from 'pg';
import { migrate } from './migrate.ts';
import { bringInToUnderstand } from './understanding.ts';
import { documentOf, readWorkflow } from './workflows.ts';

const owner = process.env['ORBIT_TEST_DATABASE_URL'] ?? `postgres://${process.env['USER']}@localhost/orbit2_test`;
let db: Client;
let applicationId: string;

before(async () => {
  await migrate(owner);
  db = new Client({ connectionString: owner });
  await db.connect();
  const { rows: [a] } = await db.query<{ id: string }>(
    `INSERT INTO application (name, surface) VALUES ($1, 'browser') RETURNING id`, [`Portal ${crypto.randomUUID().slice(0, 6)}`]);
  applicationId = a!.id;
  await db.query(
    `INSERT INTO application_revision (application_id, revision, addresses, sign_in_as, credential_name)
     VALUES ($1, 1, $2, 'svc', 'PW')`, [applicationId, JSON.stringify([{ host: 'localhost:4101', pathPrefix: '/' }])]);
});
after(async () => { await db?.end(); });

const PROCEDURE = [
  'Note rate enquiry',
  '',
  'This procedure is used when a broker asks. It applies to every desk.',
  '',
  'Steps',
  '1. Sign in to the portal.',
  '2. If there is no such file, say so. That happens a lot.',
  'Do not change anything.',
].join('\n');

test('the document keeps the author\'s blocks', async () => {
  const brought = await bringInToUnderstand(db as never, {
    name: 'Blocks', procedure: PROCEDURE, applicationId, startPath: '/', inputs: {} });
  assert.ok(brought.ok);
  const document = await documentOf(db, brought.id);
  const starts = document!.map((s) => [s.number, s.startsBlock]);
  assert.deepEqual(starts, [
    ['1.1', true],   // heading
    ['1.2', true],   // after a heading
    ['1.3', false],  // same paragraph
    ['1.4', true],   // heading
    ['1.5', true],   // list item
    ['1.6', true],   // list item
    ['1.7', false],  // same line as the item: part of it
    ['1.8', false],  // the next line, no blank line: carries on
  ]);
});

test('a step reaches the picture of the turn that made it', async () => {
  const { rows: [w] } = await db.query<{ id: string }>(`INSERT INTO workflow (name) VALUES ('Pictures') RETURNING id`);
  const shot = { digest: `sha256:${'a'.repeat(64)}`, box: { x: 0.1, y: 0.2, w: 0.3, h: 0.05 } };
  await db.query(
    `INSERT INTO model_call (workflow_id, turn, provider, model, shown, verdict, screenshot)
     VALUES ($1, 4, 'openai', 'm', '{}', 'kept', $2)`, [w!.id, JSON.stringify(shot)]);
  await db.query(
    `INSERT INTO workflow_step (workflow_id, position, kind, declares, complete, from_sentence, made_at_turn)
     VALUES ($1, 1, 'activate', $2, true, '1.5', 4)`,
    [w!.id, JSON.stringify({ summary: 'Sign in', control: { label: 'Sign in', binding: { strategy: 'roleAndName', role: 'button', name: 'Sign in' } },
      then: { describe: 'moves on' }, changesARecord: false })]);
  const read = await readWorkflow(w!.id, db);
  const step = read!.steps[0]!;
  assert.equal(step.made_at_turn, 4);
  const turn = read!.authoring.turns.find((t) => t.turn === step.made_at_turn);
  assert.deepEqual(turn.screenshot, shot);
});
