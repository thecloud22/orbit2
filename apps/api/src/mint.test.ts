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
