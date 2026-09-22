/**
 * Publication mints, and never edits (§4). These prove the three things that
 * claim rests on: the same workflow publishes the same digest twice, an
 * outstanding question stops it, and a second publication is a second version
 * rather than a change to the first.
 */
import { strict as assert } from 'node:assert';
import { after, before, test } from 'node:test';
import { Client } from 'pg';
import { describeBlocker } from '@orbit/contract';
import { migrate } from './migrate.ts';
import { broughtInAgainst } from './test-fixtures.ts';
import { mintVersion } from './mint.ts';

const owner = process.env['ORBIT_TEST_DATABASE_URL'] ?? `postgres://${process.env['USER']}@localhost/orbit2_test`;
let db: Client;
let workflowId: string;

const step = (position: number, kind: string, declares: object) =>
  db.query(`INSERT INTO workflow_step (workflow_id, position, kind, declares, complete)
            VALUES ($1, $2, $3, $4, true)`, [workflowId, position, kind, JSON.stringify(declares)]);

before(async () => {
  await migrate(owner);
  db = new Client({ connectionString: owner });
  await db.connect();
  const { rows: [w] } = await db.query<{ id: string }>(
    `INSERT INTO workflow (name, declared_inputs, outcomes, examples, confirmed_at)
     VALUES ('Lookup', $1, $2, $3, now()) RETURNING id`,
    [JSON.stringify([{ name: 'reference', label: 'Reference', type: 'text', required: true }]),
     JSON.stringify([{ name: 'found', label: 'Found' }]),
     JSON.stringify({ found: 'SR-4417' })]);
  workflowId = w!.id;
  await broughtInAgainst(db, workflowId);

  await step(1, 'read', { summary: 'the status',
    region: { label: 'Status', binding: { strategy: 'roleAndName', role: 'heading', name: 'Status' } },
    produces: { name: 'status', label: 'Status', type: 'text', required: false } });
  await step(2, 'end', { summary: 'found', outcome: 'found', publishes: ['status'] });
});
after(async () => { await db?.end(); });

test('publishing mints a version with a digest over what was approved', async () => {
  const result = await mintVersion(db as never, workflowId);
  assert.equal(result.outcome, 'published');
  assert.equal(result.version, 1);
  assert.match(result.digest, /^sha256:[0-9a-f]{64}$/);
});

test('publishing again mints a second version and does not touch the first', async () => {
  const first = await db.query<{ digest: string }>(
    `SELECT digest FROM workflow_version WHERE workflow_id = $1 AND version = 1`, [workflowId]);
  const again = await mintVersion(db as never, workflowId);
  assert.equal(again.outcome, 'published');
  assert.equal(again.version, 2);
  const after = await db.query<{ digest: string }>(
    `SELECT digest FROM workflow_version WHERE workflow_id = $1 AND version = 1`, [workflowId]);
  assert.equal(after.rows[0]!.digest, first.rows[0]!.digest, 'version 1 is a fact, not a draft');
});

test('the digest is the same for the same content, because key order is not identity', async () => {
  const { rows } = await db.query<{ digest: string }>(
    `SELECT digest FROM workflow_version WHERE workflow_id = $1 ORDER BY version`, [workflowId]);
  assert.equal(rows[0]!.digest, rows[1]!.digest,
    'two publications of an unchanged workflow must agree, or the digest measures the serialiser');
});

test('an outstanding question stops publication, and says what it is', async () => {
  await db.query(
    `INSERT INTO workflow_note (workflow_id, kind, body)
     VALUES ($1, 'question', 'Which of the two amount fields did you mean?')`, [workflowId]);
  const refused = await mintVersion(db as never, workflowId);
  assert.equal(refused.outcome, 'refused');
  const blocker = refused.blockers.find((b) => b.kind === 'outstanding');
  assert.ok(blocker, 'the question is the blocker');
  assert.match(describeBlocker(blocker), /Which of the two amount fields/);

  // And nothing was minted by the attempt.
  const { rows } = await db.query(`SELECT count(*)::int AS n FROM workflow_version WHERE workflow_id = $1`, [workflowId]);
  assert.equal(rows[0]!.n, 2, 'a refused publication mints nothing');
});

test('an unconfirmed workflow cannot be published, because nobody has attested to it', async () => {
  // §4's status table: "Cannot be published until confirmed." With attribution
  // deferred, confirmation is the only human act on the record — publishing
  // past it would mean nothing anywhere says a person looked at this.
  await db.query(`UPDATE workflow SET confirmed_at = NULL WHERE id = $1`, [workflowId]);

  const result = await mintVersion(db as never, workflowId);
  assert.equal(result.outcome, 'refused');
  assert.ok(result.outcome === 'refused' && result.blockers.some((b) => b.kind === 'notConfirmed'),
    `refused for want of confirmation: ${JSON.stringify(result)}`);
});

/** A workflow of its own, so a test that adds a step does not change the others. */
async function aWorkflowWith(steps: Array<{ kind: string; declares: object }>): Promise<string> {
  const { rows: [w] } = await db.query<{ id: string }>(
    `INSERT INTO workflow (name, declared_inputs, outcomes, examples, confirmed_at)
     VALUES ($1, '[]', $2, $3, now()) RETURNING id`,
    [`Authority ${crypto.randomUUID().slice(0, 6)}`,
     JSON.stringify([{ name: 'done', label: 'Done' }]), JSON.stringify({ done: 'x' })]);
  for (const [i, s] of steps.entries()) {
    await db.query(
      `INSERT INTO workflow_step (workflow_id, position, kind, declares, complete)
       VALUES ($1, $2, $3, $4, true)`, [w!.id, i + 1, s.kind, JSON.stringify(s.declares)]);
  }
  await broughtInAgainst(db, w!.id);
  return w!.id;
}

const approveFile = {
  kind: 'activate',
  declares: {
    summary: 'Approve file',
    control: { label: 'Approve file', binding: { strategy: 'roleAndName', role: 'button', name: 'Approve file' } },
    then: { describe: 'the file is approved' },
    changesARecord: true,
  },
};
const ending = { kind: 'end', declares: { summary: 'done', outcome: 'done', publishes: [] } };

async function authorityOf(workflowId: string): Promise<boolean> {
  const minted = await mintVersion(db as never, workflowId);
  assert.equal(minted.outcome, 'published', JSON.stringify(minted));
  const { rows } = await db.query<{ may_change_records: boolean }>(
    `SELECT may_change_records FROM workflow_version WHERE workflow_id = $1 ORDER BY version DESC LIMIT 1`,
    [workflowId]);
  return rows[0]!.may_change_records;
}

test('a version that presses something committing says it may change records', async () => {
  // It was written as false for every version, so a workflow that approves a
  // loan published as one with no authority to write — and the run page told
  // readers "It changed: Nothing" about runs that had approved one.
  assert.equal(await authorityOf(await aWorkflowWith([approveFile, ending])), true);
});

test('a version that only reads does not claim authority it does not need', async () => {
  assert.equal(await authorityOf(await aWorkflowWith([ending])), false);
});

test('a version carries only the application it was brought in against', async () => {
  // Another application registered beside it, whose id may well sort first.
  const { rows: [other] } = await db.query<{ id: string }>(
    `INSERT INTO application (name, surface) VALUES ('Somewhere else', 'browser') RETURNING id`);
  await db.query(`INSERT INTO application_revision (application_id, revision, addresses) VALUES ($1, 1, $2)`,
    [other!.id, JSON.stringify([{ host: 'google.com', pathPrefix: '/' }])]);
  const id = await aWorkflowWith([{ kind: 'end', declares: { summary: 'done', outcome: 'done', publishes: [] } }]);
  const result = await mintVersion(db as never, id);
  assert.equal(result.outcome, 'published');
  const { rows: [v] } = await db.query<{ applications: Array<{ addresses: Array<{ host: string }> }> }>(
    `SELECT applications FROM workflow_version WHERE workflow_id = $1`, [id]);
  assert.deepEqual(v!.applications.map((a) => a.addresses[0]!.host), ['localhost:4101']);
});

test('a draft nobody recorded an application for is refused, not guessed', async () => {
  const { rows: [w] } = await db.query<{ id: string }>(
    `INSERT INTO workflow (name, declared_inputs, outcomes, examples, confirmed_at)
     VALUES ('Orphan', '[]', $1, $2, now()) RETURNING id`,
    [JSON.stringify([{ name: 'done', label: 'Done' }]), JSON.stringify({ done: 'x' })]);
  await db.query(`INSERT INTO workflow_step (workflow_id, position, kind, declares, complete)
    VALUES ($1, 1, 'end', $2, true)`, [w!.id, JSON.stringify({ summary: 'done', outcome: 'done', publishes: [] })]);
  const result = await mintVersion(db as never, w!.id);
  assert.equal(result.outcome, 'refused');
  assert.ok(result.outcome === 'refused' && result.blockers.some((b) => b.kind === 'applicationUnknown'));
});

test('a version drafted from a sort carries the sort, and its digest covers it', async () => {
  const id = await aWorkflowWith([{ kind: 'end', declares: { summary: 'done', outcome: 'done', publishes: [] } }]);
  // aWorkflowWith records the application through an understanding row, as a
  // 2.1 draft has; give it the sentences and labels one would.
  const { rows: [part] } = await db.query<{ id: string }>(
    `INSERT INTO procedure_part (workflow_id, key, source, body) VALUES ($1, '1', 'pasted', 'Log in. Phone them.') RETURNING id`, [id]);
  const { rows: sentences } = await db.query<{ id: string }>(
    `INSERT INTO procedure_sentence (part_id, n, text, kind, start_at, end_at)
     VALUES ($1, 1, 'Log in.', 'prose', 0, 7), ($1, 2, 'Phone them.', 'prose', 8, 19) RETURNING id`, [part!.id]);
  await db.query(
    `INSERT INTO sentence_label (sentence_id, label, reason, basis, given_by)
     VALUES ($1, 'task', 'r', 'stated', 'model'), ($2, 'forAPerson', 'r', 'stated', 'author')`,
    [sentences[0]!.id, sentences[1]!.id]);

  const result = await mintVersion(db as never, id);
  assert.equal(result.outcome, 'published');
  const { rows: [v] } = await db.query<{ body: { understanding?: { sentences: unknown[]; coverage: unknown } } }>(
    `SELECT body FROM workflow_version WHERE workflow_id = $1`, [id]);
  assert.deepEqual(v!.body.understanding, {
    sentences: [
      { number: '1.1', text: 'Log in.', label: 'task', givenBy: 'model' },
      { number: '1.2', text: 'Phone them.', label: 'forAPerson', givenBy: 'author' },
    ],
    coverage: { total: 2, byLabel: { task: 1, forAPerson: 1 } },
    steps: {},
    chat: [],
  });
});

test('a version drafted any other way carries no sort', async () => {
  const { rows: [w] } = await db.query<{ id: string }>(
    `INSERT INTO workflow (name, declared_inputs, outcomes, examples, confirmed_at)
     VALUES ('Walked directly', '[]', $1, $2, now()) RETURNING id`,
    [JSON.stringify([{ name: 'done', label: 'Done' }]), JSON.stringify({ done: 'x' })]);
  await db.query(`INSERT INTO workflow_step (workflow_id, position, kind, declares, complete)
    VALUES ($1, 1, 'end', $2, true)`, [w!.id, JSON.stringify({ summary: 'done', outcome: 'done', publishes: [] })]);
  const app = await broughtInAgainst(db, w!.id);
  // Swap the understanding row for the authoring session a 2.0 walk leaves.
  await db.query(`DELETE FROM understanding WHERE workflow_id = $1`, [w!.id]);
  await db.query(`INSERT INTO authoring_session (name, procedure, application_id, start_path, status, workflow_id, ended_at)
    VALUES ('x', 'y', $1, '/', 'brought in', $2, now())`, [app, w!.id]);
  const result = await mintVersion(db as never, w!.id);
  assert.equal(result.outcome, 'published');
  const { rows: [v] } = await db.query<{ body: Record<string, unknown> }>(
    `SELECT body FROM workflow_version WHERE workflow_id = $1`, [w!.id]);
  assert.equal('understanding' in v!.body, false);
});
