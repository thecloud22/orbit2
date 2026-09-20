/**
 * §6's refusals. Reordering, deleting and editing each validate on save, and
 * the ones that matter are the refusals — an editor that lets you break a
 * workflow and tells you at publication has moved the cost to the worst
 * possible moment.
 */
import { strict as assert } from 'node:assert';
import { after, before, beforeEach, test } from 'node:test';
import { Client } from 'pg';
import { migrate } from './migrate.ts';
import { deleteStep, editStep, insertStep, moveStep } from './edit.ts';
import { mintVersion } from './mint.ts';

const owner = process.env['ORBIT_TEST_DATABASE_URL'] ?? `postgres://${process.env['USER']}@localhost/orbit2_test`;
let db: Client;
let workflowId: string;
let readId: string;
let endId: string;

before(async () => { await migrate(owner); db = new Client({ connectionString: owner }); await db.connect(); });
after(async () => { await db?.end(); });

beforeEach(async () => {
  const { rows: [w] } = await db.query<{ id: string }>(
    `INSERT INTO workflow (name, outcomes, confirmed_at) VALUES ('Edit', $1, now()) RETURNING id`,
    [JSON.stringify([{ name: 'done', label: 'Done' }])]);
  workflowId = w!.id;
  readId = crypto.randomUUID();
  endId = crypto.randomUUID();
  await db.query(
    `INSERT INTO workflow_step (id, workflow_id, position, kind, declares, complete) VALUES
       ($1, $3, 1, 'read', $4, true),
       ($2, $3, 2, 'end',  $5, true)`,
    [readId, endId, workflowId,
     JSON.stringify({ summary: 'the status',
       region: { label: 'Status', binding: { strategy: 'roleAndName', role: 'heading', name: 'Status' } },
       produces: { name: 'status', label: 'Status', type: 'text', required: false } }),
     JSON.stringify({ summary: 'done', outcome: 'done', publishes: ['status'] })]);
});

test('a reorder that would use a value before it exists is refused, with the reason', async () => {
  const result = await moveStep(db as never, workflowId, endId, 1);
  assert.equal(result.ok, false);
  // Both consequences, not the first. Dragging the ending to the front also
  // strands everything behind it, and a person fixing this wants to see that
  // now rather than after they have fixed the value.
  assert.match(result.because, /uses "status", which is not produced on every path/);
  assert.match(result.because, /Nothing can reach step 2, so it would never run/);

  // And nothing moved. A refusal that half-applies is worse than one that does not.
  const { rows } = await db.query<{ position: number; kind: string }>(
    `SELECT position, kind FROM workflow_step WHERE workflow_id = $1 ORDER BY position`, [workflowId]);
  assert.deepEqual(rows.map((r) => r.kind), ['read', 'end']);
});

test('deleting the step that produces a value a later step needs is refused', async () => {
  const result = await deleteStep(db as never, workflowId, readId);
  assert.equal(result.ok, false);
  assert.match(result.because, /uses "status", which no step produces/);
});

test('deleting the ending is refused, because a path would reach no conclusion', async () => {
  const result = await deleteStep(db as never, workflowId, endId);
  assert.equal(result.ok, false);
  assert.match(result.because, /runs out without reaching a conclusion/);
});

test('editing returns a confirmed workflow to draft', async () => {
  // §4: confirmation attests to a particular set of steps. Change them and the
  // attestation no longer refers to anything anybody attested to.
  const before = await db.query<{ confirmed_at: string | null }>(
    `SELECT confirmed_at FROM workflow WHERE id = $1`, [workflowId]);
  assert.ok(before.rows[0]!.confirmed_at, 'it started confirmed');

  const result = await editStep(db as never, workflowId, readId, {
    summary: 'the status, corrected',
    region: { label: 'Current status', binding: { strategy: 'roleAndName', role: 'heading', name: 'Current status' } },
    produces: { name: 'status', label: 'Status', type: 'text', required: false },
  });
  assert.equal(result.ok, true);

  const after = await db.query<{ confirmed_at: string | null }>(
    `SELECT confirmed_at FROM workflow WHERE id = $1`, [workflowId]);
  assert.equal(after.rows[0]!.confirmed_at, null, 'and confirmation lapsed');
});

test('a step that fails validation is not stored at all', async () => {
  const result = await editStep(db as never, workflowId, readId, { summary: 'broken' });
  assert.equal(result.ok, false);

  const { rows } = await db.query<{ declares: { summary: string } }>(
    `SELECT declares FROM workflow_step WHERE id = $1`, [readId]);
  assert.equal(rows[0]!.declares.summary, 'the status', 'not even the part that parsed');
});

test('an inserted step is incomplete, and says so until it is configured', async () => {
  const inserted = await insertStep(db as never, workflowId, 'activate', 1);
  assert.equal(inserted.ok, true);

  const { rows } = await db.query<{ position: number; kind: string; complete: boolean }>(
    `SELECT position, kind, complete FROM workflow_step WHERE workflow_id = $1 ORDER BY position`, [workflowId]);
  assert.deepEqual(rows.map((r) => r.kind), ['read', 'activate', 'end']);
  assert.equal(rows[1]!.complete, false, 'incomplete until configured, and blocking publication until then');
});

test('a draft containing a half-written step is still a draft you can work on', async () => {
  // The bug this covers: an inserted step could not be parsed by the published
  // schema, so every later read of the draft failed. Inserting a step must not
  // lock you out of the workflow you inserted it into.
  const inserted = await insertStep(db as never, workflowId, 'activate', 1);
  assert.equal(inserted.ok, true);

  const moved = await moveStep(db as never, workflowId, endId, 3);
  assert.equal(moved.ok, true, 'the draft still reorders around the unfinished step');

  const { rows } = await db.query<{ kind: string }>(
    `SELECT kind FROM workflow_step WHERE workflow_id = $1 ORDER BY position`, [workflowId]);
  assert.deepEqual(rows.map((r) => r.kind), ['read', 'activate', 'end']);
});

test('publication names the half-written step rather than failing to read it', async () => {
  const inserted = await insertStep(db as never, workflowId, 'activate', 1);
  assert.equal(inserted.ok, true);

  const minted = await mintVersion(db as never, workflowId);
  assert.equal(minted.outcome, 'refused');
  assert.ok(minted.outcome === 'refused' && minted.blockers.some(
    (b) => b.kind === 'stepIncomplete' && b.step === 2 && b.missing.length > 0),
    `step 2 named as unfinished, with what it is missing: ${JSON.stringify(minted)}`);
});

test('a draft that is already broken can still be edited back towards working', async () => {
  // The trap this avoids: judging each edit against "is the result flawless"
  // means a draft broken for any reason cannot be edited at all, including by
  // the edit that would fix it.
  await insertStep(db as never, workflowId, 'activate', 2);   // now unfinished, and blocking

  const stray = await db.query<{ id: string }>(
    `SELECT id FROM workflow_step WHERE workflow_id = $1 AND complete = false`, [workflowId]);
  const removed = await deleteStep(db as never, workflowId, stray.rows[0]!.id);
  assert.equal(removed.ok, true, 'the way out is not barred by the state it leads out of');

  const { rows } = await db.query<{ kind: string }>(
    `SELECT kind FROM workflow_step WHERE workflow_id = $1 ORDER BY position`, [workflowId]);
  assert.deepEqual(rows.map((r) => r.kind), ['read', 'end']);
});
