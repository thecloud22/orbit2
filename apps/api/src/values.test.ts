/**
 * Values edited on the procedure editor (plan R8–R13, R26). What is proved:
 * an input can be declared, changed and removed, and removing one a step uses
 * is refused naming the step; a fixed value becomes an input ("Use an input
 * here"); a reference typed as a string is refused by the schema before
 * anything is looked at; a rename carries through every step and ending; a
 * value is placed in an object, and two values cannot take one field; and an
 * ending cannot hand back a value its path never found.
 */
import { strict as assert } from 'node:assert';
import { after, before, beforeEach, test } from 'node:test';
import { Client } from 'pg';
import { migrate } from './migrate.ts';
import { changeInput, declareInput, removeInput, renameValue, setPublishes, setStepValue, setValueObject } from './values.ts';

const owner = process.env['ORBIT_TEST_DATABASE_URL'] ?? `postgres://${process.env['USER']}@localhost/orbit2_test`;
let db: Client;
let W: string;
const fresh = () => ({ signIn: crypto.randomUUID(), loan: crypto.randomUUID(), read: crypto.randomUUID(),
  branch: crypto.randomUUID(), end: crypto.randomUUID(), missing: crypto.randomUUID() });
let id = fresh();

before(async () => { await migrate(owner); db = new Client({ connectionString: owner }); await db.connect(); });
after(async () => { await db?.end(); });

const target = (label: string, role = 'textbox') => ({ label, binding: { strategy: 'roleAndName', role, name: label } });

beforeEach(async () => {
  id = fresh();
  const { rows: [w] } = await db.query<{ id: string }>(
    `INSERT INTO workflow (name, declared_inputs, outcomes) VALUES ('Values', '[]', $1) RETURNING id`,
    [JSON.stringify([{ name: 'approved', label: 'Approved' }, { name: 'noSuchFile', label: 'No such file' }])]);
  W = w!.id;
  const steps: Array<[string, string, Record<string, unknown>]> = [
    [id.signIn, 'enter', { summary: 'secret', into: target('Password'), value: { from: 'secret', credential: 'PW' }, sensitive: true }],
    [id.loan, 'enter', { summary: 'ML-1, into Loan number', into: target('Loan number'),
      value: { from: 'literal', literal: { type: 'text', text: 'ML-1' } }, sensitive: false }],
    [id.read, 'read', { summary: 'LTV', region: target('LTV', 'cell'),
      produces: { name: 'ltv', label: 'LTV', type: 'number', required: false } }],
    [id.branch, 'branch', { summary: 'there?', when: { of: 'absence', operator: 'isNotAbsent', left: { from: 'step', value: 'ltv' } },
      ifTrue: id.end, ifFalse: id.missing }],
    [id.end, 'end', { summary: 'Approved', outcome: 'approved', publishes: ['ltv'] }],
    [id.missing, 'end', { summary: 'No such file', outcome: 'noSuchFile', publishes: [] }],
  ];
  for (const [i, [sid, kind, declares]] of steps.entries()) {
    await db.query(`INSERT INTO workflow_step (id, workflow_id, position, kind, declares, complete) VALUES ($1, $2, $3, $4, $5, true)`,
      [sid, W, i + 1, kind, JSON.stringify(declares)]);
  }
});

const inputs = async () => (await db.query(`SELECT declared_inputs FROM workflow WHERE id = $1`, [W])).rows[0]!.declared_inputs;
const declares = async (sid: string) => (await db.query(`SELECT declares FROM workflow_step WHERE id = $1`, [sid])).rows[0]!.declares;

test('a fixed value becomes an input, and a used input cannot be removed', async () => {
  assert.deepEqual(await declareInput(db as never, W, { name: 'loanNumber', label: 'Loan number', of: { object: 'loan', field: 'number' } }), { ok: true });
  assert.deepEqual((await inputs())[0], { name: 'loanNumber', label: 'Loan number', type: 'text', required: true, of: { object: 'loan', field: 'number' } });

  assert.deepEqual(await setStepValue(db as never, W, { stepId: id.loan, value: { from: 'input', value: 'loanNumber' } }), { ok: true });
  assert.deepEqual((await declares(id.loan)).value, { from: 'input', value: 'loanNumber' });

  const refused = await removeInput(db as never, W, { name: 'loanNumber' });
  assert.equal(refused.ok, false);
  assert.match((refused as { because: string }).because, /step 2 uses it/);

  assert.deepEqual(await changeInput(db as never, W, { name: 'loanNumber', label: 'The loan number' }), { ok: true });
  assert.equal((await inputs())[0].label, 'The loan number');
});

test('a reference typed as text is refused by the schema', async () => {
  for (const value of [{ from: 'input', value: '{loanNumber}' }, { from: 'step', value: 'ltv + 1' }]) {
    const refused = await setStepValue(db as never, W, { stepId: id.loan, value });
    assert.equal(refused.ok, false);
    assert.match((refused as { because: string }).because, /picked from the list/);
  }
  assert.equal((await declares(id.loan)).value.from, 'literal', 'nothing was written');
});

test('the sign-in is not a value an author can change', async () => {
  await declareInput(db as never, W, { name: 'who', label: 'Who' });
  const refused = await setStepValue(db as never, W, { stepId: id.signIn, value: { from: 'input', value: 'who' } });
  assert.equal(refused.ok, false);
  assert.match((refused as { because: string }).because, /sign-in/);
});

test('a name is never taken twice', async () => {
  const refused = await declareInput(db as never, W, { name: 'ltv', label: 'LTV' });
  assert.equal(refused.ok, false);
  assert.match((refused as { because: string }).because, /already the name of the value step 3 reads/);
});

test('a rename carries through every step that uses it', async () => {
  assert.deepEqual(await renameValue(db as never, W, { from: 'ltv', to: 'loanToValue' }), { ok: true });
  assert.equal((await declares(id.read)).produces.name, 'loanToValue');
  assert.equal((await declares(id.branch)).when.left.value, 'loanToValue');
  assert.deepEqual((await declares(id.end)).publishes, ['loanToValue']);
});

test('a value is placed in an object, and one field holds one value', async () => {
  assert.deepEqual(await setValueObject(db as never, W, { name: 'ltv', of: { object: 'loan', field: 'ltv' } }), { ok: true });
  assert.deepEqual((await declares(id.read)).produces.of, { object: 'loan', field: 'ltv' });
  const refused = await declareInput(db as never, W, { name: 'other', label: 'Other', of: { object: 'loan', field: 'ltv' } });
  assert.equal(refused.ok, false);
  assert.match((refused as { because: string }).because, /loan already has a field called ltv/);
  assert.deepEqual(await setValueObject(db as never, W, { name: 'ltv', of: null }), { ok: true });
  assert.equal((await declares(id.read)).produces.of, undefined);
});

test('an ending cannot hand back what its path never found', async () => {
  const refused = await setPublishes(db as never, W, { stepId: id.missing, publishes: ['creditScore'] });
  assert.equal(refused.ok, false);
  assert.match((refused as { because: string }).because, /creditScore/);
  assert.deepEqual(await setPublishes(db as never, W, { stepId: id.end, publishes: [] }), { ok: true });
  assert.deepEqual((await declares(id.end)).publishes, []);
});
