/**
 * Answering a question on the page (Decision 17 item 4, R19). What is proved:
 * a fixed-value question becomes an input in one answer; a question about what
 * on the page a sentence means takes only a name the page offered, or "not on
 * this page"; an example goes where the next mapping reads it; and an answered
 * question cannot be answered again.
 */
import { strict as assert } from 'node:assert';
import { after, before, test } from 'node:test';
import { Client } from 'pg';
import { migrate } from './migrate.ts';
import { answerQuestion } from './questions.ts';
import { broughtInAgainst } from './test-fixtures.ts';

const owner = process.env['ORBIT_TEST_DATABASE_URL'] ?? `postgres://${process.env['USER']}@localhost/orbit2_test`;
let db: Client;
before(async () => { await migrate(owner); db = new Client({ connectionString: owner }); await db.connect(); });
after(async () => { await db?.end(); });

async function aDraft() {
  const { rows: [w] } = await db.query<{ id: string }>(`INSERT INTO workflow (name, declared_inputs) VALUES ('Questions', '[]') RETURNING id`);
  await broughtInAgainst(db, w!.id);
  const step = crypto.randomUUID();
  await db.query(`INSERT INTO workflow_step (id, workflow_id, position, kind, declares, complete) VALUES ($1, $2, 1, 'enter', $3, true)`,
    [step, w!.id, JSON.stringify({ summary: 'ML-1', into: { label: 'Loan number', binding: { strategy: 'label', name: 'Loan number' } },
      value: { from: 'literal', literal: { type: 'text', text: 'ML-26-04471' } }, sensitive: false })]);
  return { W: w!.id, step };
}
const ask = async (W: string, fields: Record<string, unknown>) => (await db.query<{ id: string }>(
  `INSERT INTO workflow_note (workflow_id, kind, body, sentence, step_id, candidates, action) VALUES ($1, 'question', 'q', '1.7', $2, $3, $4) RETURNING id`,
  [W, fields['step'] ?? null, fields['candidates'] ? JSON.stringify(fields['candidates']) : null, fields['action']])).rows[0]!.id;

test('a fixed value becomes an input, its value the example', async () => {
  const { W, step } = await aDraft();
  const noteId = await ask(W, { action: 'useInput', step });
  assert.deepEqual(await answerQuestion(db as never, W, { noteId }), { ok: true });
  const { rows: [w] } = await db.query(`SELECT declared_inputs FROM workflow WHERE id = $1`, [W]);
  assert.equal(w!.declared_inputs[0].name, 'loanNumber');
  const { rows: [s] } = await db.query(`SELECT declares FROM workflow_step WHERE id = $1`, [step]);
  assert.deepEqual(s!.declares.value, { from: 'input', value: 'loanNumber' });
  const { rows: [u] } = await db.query(`SELECT inputs FROM understanding WHERE workflow_id = $1`, [W]);
  assert.equal(u!.inputs.loanNumber, 'ML-26-04471');
  const again = await answerQuestion(db as never, W, { noteId });
  assert.equal(again.ok, false);
});

test('what a sentence means is a name the page offered, or not on the page', async () => {
  const { W } = await aDraft();
  const noteId = await ask(W, { action: 'pickElement', candidates: [{ name: 'Back-end DTI', what: 'value' }] });
  const invented = await answerQuestion(db as never, W, { noteId, candidate: 'Something else' });
  assert.equal(invented.ok, false, 'a name the page did not offer is not an answer');
  assert.deepEqual(await answerQuestion(db as never, W, { noteId, candidate: 'Back-end DTI' }), { ok: true });
  const { rows: [n] } = await db.query(`SELECT answer, resolved_at FROM workflow_note WHERE id = $1`, [noteId]);
  assert.equal(n!.answer, 'It is “Back-end DTI”.');
  assert.ok(n!.resolved_at);
  const second = await ask(W, { action: 'pickElement', candidates: [] });
  assert.deepEqual(await answerQuestion(db as never, W, { noteId: second, notOnPage: true }), { ok: true });
});

test('an example is kept where the next mapping reads it', async () => {
  const { W } = await aDraft();
  const noteId = await ask(W, { action: 'giveExample', candidates: [{ name: 'loanNumber', what: 'input' }] });
  assert.deepEqual(await answerQuestion(db as never, W, { noteId, example: 'ML-26-04488' }), { ok: true });
  const { rows: [u] } = await db.query(`SELECT inputs FROM understanding WHERE workflow_id = $1`, [W]);
  assert.equal(u!.inputs.loanNumber, 'ML-26-04488');
});
