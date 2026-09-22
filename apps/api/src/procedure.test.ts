/**
 * A procedure held in parts. What matters is what cannot happen: an earlier
 * sentence renumbered by a later part, half a labelling kept, a sentence or a
 * label edited after the fact. Run as the application role, because that is
 * the role whose limits are the guarantee.
 */
import { strict as assert } from 'node:assert';
import { after, before, beforeEach, describe, test } from 'node:test';
import { Client } from 'pg';
import { migrate } from './migrate.ts';
import { addPart, readCoverage, recordLabelling } from './procedure.ts';
import { discardDraft } from './edit.ts';
import { PART_SOURCES, SENTENCE_LABELS } from '@orbit/contract';

const owner = process.env['ORBIT_TEST_DATABASE_URL'] ?? `postgres://${process.env['USER']}@localhost/orbit2_test`;
const asApp = owner.replace(/\/\/[^@]*@/, '//orbit_app:orbit_app_local_only@');
let app: Client;
let workflowId: string;

const PART_ONE = 'Log into Claims Central. Search for the claim.\n- If it is closed, pass it to the claims team.';
const PART_TWO = 'Record the status. Tell the requester.';

const labelled = (numbers: string[], label = 'task') =>
  numbers.map((sentence) => ({ sentence, label, reason: 'it says to', basis: 'stated' }));

before(async () => {
  await migrate(owner);
  const setup = new Client({ connectionString: owner });
  await setup.connect();
  await setup.query('GRANT CONNECT ON DATABASE orbit2_test TO orbit_app');
  await setup.end();
  app = new Client({ connectionString: asApp });
  await app.connect();
});
after(async () => { await app?.end(); });

beforeEach(async () => {
  const { rows: [w] } = await app.query<{ id: string }>(
    `INSERT INTO workflow (name) VALUES ('Claim status enquiry') RETURNING id`);
  workflowId = w!.id;
});

const added = async (source: string, body: string) => {
  const result = await addPart(app, workflowId, { source, body });
  assert.ok(result.ok, result.ok ? '' : result.because);
  return result;
};

describe('parts and their sentences', () => {
  test('the document is numbered 1, 2…, the author lettered A…', async () => {
    const one = await added('pasted', PART_ONE);
    assert.equal(one.key, '1');
    assert.deepEqual(one.sentences, ['1.1', '1.2', '1.3']);
    assert.equal((await added('author', 'Check payment history.')).key, 'A');
    assert.equal((await added('pdf', PART_TWO)).key, '2');
    assert.equal((await added('author', 'Hand overdue claims to Collections.')).key, 'B');
  });

  test('adding a part leaves every earlier sentence exactly as it was', async () => {
    await added('pasted', PART_ONE);
    const read = () => app.query(
      `SELECT s.id, s.n, s.text, s.start_at, s.end_at FROM procedure_sentence s
         JOIN procedure_part p ON p.id = s.part_id WHERE p.workflow_id = $1 AND p.key = '1' ORDER BY s.n`,
      [workflowId]);
    const before_ = (await read()).rows;
    await added('pasted', PART_TWO);
    assert.deepEqual((await read()).rows, before_);
  });

  test('the body is kept as it arrived, and each sentence is a span of it', async () => {
    const body = '  Log in.\r\n\r\nSearch for the claim.  ';
    await added('pasted', body);
    const { rows } = await app.query<{ body: string; text: string; start_at: number; end_at: number }>(
      `SELECT p.body, s.text, s.start_at, s.end_at FROM procedure_sentence s
         JOIN procedure_part p ON p.id = s.part_id WHERE p.workflow_id = $1 ORDER BY s.n`, [workflowId]);
    assert.equal(rows[0]!.body, body);
    for (const r of rows) assert.equal(r.body.slice(r.start_at, r.end_at), r.text);
  });

  test('a part that stops mid-sentence says which sentence', async () => {
    const result = await added('pasted', 'Search for the claim. If it was reopened within 30 days of');
    assert.equal(result.unterminated, '1.2');
  });

  test('an empty part, or one too long, is refused and writes nothing', async () => {
    assert.deepEqual(await addPart(app, workflowId, { source: 'pasted', body: ' \n ' }),
      { ok: false, because: 'There is nothing in this part to sort.' });
    const long = await addPart(app, workflowId, { source: 'pasted', body: 'Log in. '.repeat(40_000) });
    assert.equal(long.ok, false);
    const { rows: [n] } = await app.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM procedure_part WHERE workflow_id = $1`, [workflowId]);
    assert.equal(n!.n, 0);
  });

  test('a source outside the set is refused', async () => {
    assert.equal((await addPart(app, workflowId, { source: 'email', body: 'Log in.' })).ok, false);
  });
});

describe('a labelling is kept whole or not at all', () => {
  test('a complete labelling is kept and counted', async () => {
    await added('pasted', PART_ONE);
    const result = await recordLabelling(app, workflowId, '1', labelled(['1.1', '1.2', '1.3']), 'model');
    assert.equal(result.ok, true);
    const covered = await readCoverage(app, workflowId);
    assert.equal(covered.placed, 3);
    assert.equal(covered.byLabel.task, 3);
  });

  test('one that skips a sentence writes no label at all', async () => {
    await added('pasted', PART_ONE);
    const result = await recordLabelling(app, workflowId, '1', labelled(['1.1', '1.3']), 'model');
    assert.deepEqual(result, { ok: false, skipped: ['1.2'], duplicated: [], invented: [] });
    assert.equal((await readCoverage(app, workflowId)).placed, 0);
  });

  test('a labelling of one part cannot answer for another', async () => {
    await added('pasted', PART_ONE);
    await added('pasted', PART_TWO);
    const result = await recordLabelling(app, workflowId, '2', labelled(['2.1', '2.2', '1.1']), 'model');
    assert.deepEqual(result, { ok: false, skipped: [], duplicated: [], invented: ['1.1'] });
  });

  test('a relabel is a new row, and the latest one counts', async () => {
    await added('pasted', PART_TWO);
    await recordLabelling(app, workflowId, '1', labelled(['1.1', '1.2']), 'model');
    await recordLabelling(app, workflowId, '1', labelled(['1.1', '1.2'], 'forAPerson'), 'author');
    const covered = await readCoverage(app, workflowId);
    assert.equal(covered.byLabel.forAPerson, 2);
    assert.equal(covered.byLabel.task, 0);
    const { rows: [n] } = await app.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM sentence_label l JOIN procedure_sentence s ON s.id = l.sentence_id
         JOIN procedure_part p ON p.id = s.part_id WHERE p.workflow_id = $1`, [workflowId]);
    assert.equal(n!.n, 4, 'both labellings are kept');
  });

  test('coverage names what is not placed yet', async () => {
    await added('pasted', PART_ONE);
    await added('author', 'Check payment history.');
    await recordLabelling(app, workflowId, '1', labelled(['1.1', '1.2', '1.3']), 'model');
    assert.deepEqual((await readCoverage(app, workflowId)).unplaced, ['A.1']);
  });
});

describe('written once', () => {
  const refused = (error: Error & { code?: string }) =>
    error.code === '42501' || error.message.includes('append-only');

  for (const [table, set] of [
    ['procedure_part', `body = 'rewritten'`],
    ['procedure_sentence', `text = 'rewritten'`],
    ['sentence_label', `label = 'wontDo'`],
  ] as const) {
    test(`the application cannot UPDATE ${table}`, async () => {
      await added('pasted', PART_ONE);
      await recordLabelling(app, workflowId, '1', labelled(['1.1', '1.2', '1.3']), 'model');
      await assert.rejects(() => app.query(`UPDATE ${table} SET ${set}`), refused);
    });
  }

  test('even the owner cannot edit a sentence, because the trigger is the second lock', async () => {
    await added('pasted', PART_ONE);
    const asOwner = new Client({ connectionString: owner });
    await asOwner.connect();
    try {
      await assert.rejects(() => asOwner.query(`UPDATE procedure_sentence SET text = 'rewritten'`), /append-only/);
    } finally { await asOwner.end(); }
  });

  for (const table of ['procedure_sentence', 'sentence_label']) {
    test(`the application cannot DELETE from ${table} on its own`, async () => {
      await assert.rejects(() => app.query(`DELETE FROM ${table}`), refused);
    });
  }

  test('discarding a draft takes its procedure with it', async () => {
    await added('pasted', PART_ONE);
    await recordLabelling(app, workflowId, '1', labelled(['1.1', '1.2', '1.3']), 'model');
    const discarded = await discardDraft(app as never, workflowId);
    assert.deepEqual(discarded, { ok: true, removed: 'everything' });
    const { rows: [n] } = await app.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM procedure_part WHERE workflow_id = $1`, [workflowId]);
    assert.equal(n!.n, 0);
  });

  test('a draft kept for how it was authored still loses its procedure', async () => {
    await added('pasted', PART_ONE);
    await recordLabelling(app, workflowId, '1', labelled(['1.1', '1.2', '1.3']), 'model');
    // A model call is authoring evidence, so the draft is archived rather than deleted.
    await app.query(
      `INSERT INTO model_call (workflow_id, turn, provider, model, shown, answered, verdict, why,
                               tokens_in, tokens_out, cost_micros)
       VALUES ($1, 1, 'openai', 'gpt-6-luna', '{}', '{}', 'kept', 'sorted part 1', 10, 10, 5)`, [workflowId]);
    const discarded = await discardDraft(app as never, workflowId);
    assert.deepEqual(discarded, { ok: true, removed: 'all but how it was authored' });
    const { rows: [n] } = await app.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM procedure_part WHERE workflow_id = $1`, [workflowId]);
    assert.equal(n!.n, 0);
  });
});

describe('the database knows the same closed sets as the contract', () => {
  test('every label is accepted, and a typo is refused', async () => {
    await added('pasted', 'Log in.');
    for (const label of SENTENCE_LABELS) {
      assert.equal((await recordLabelling(app, workflowId, '1', labelled(['1.1'], label), 'model')).ok, true, label);
    }
    await assert.rejects(() => app.query(
      `INSERT INTO sentence_label (sentence_id, label, reason, basis, given_by)
       SELECT s.id, 'forAPersn', 'x', 'stated', 'model' FROM procedure_sentence s
         JOIN procedure_part p ON p.id = s.part_id WHERE p.workflow_id = $1`, [workflowId]),
      /sentence_label_label_check/);
  });

  test('every source is accepted', async () => {
    for (const source of PART_SOURCES) assert.equal((await addPart(app, workflowId, { source, body: 'Log in.' })).ok, true, source);
  });
});
