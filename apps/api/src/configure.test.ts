/**
 * Finishing a step that was added by hand.
 *
 * Adding a step produced one that said nothing and could never be completed:
 * `editStep` existed and no screen called it, so the only outcome of the
 * control was a draft publication would refuse forever.
 *
 * The assertion that matters most is the negative one. An author may say what
 * a step *decides*; they may not say how it *finds* anything, because Orbit
 * derives that from its own view of the page (Decision 15). That is a property
 * of the schema — `object()` is `z.strictObject` — rather than a check
 * somebody has to remember, and it is tested as such.
 */
import { strict as assert } from 'node:assert';
import { after, before, beforeEach, test } from 'node:test';
import { Client } from 'pg';
import { migrate } from './migrate.ts';
import { configureStep } from './configure.ts';
import { insertStep } from './edit.ts';
import { confirm } from './confirm.ts';
import { mintVersion } from './mint.ts';
import { asDraftStep } from './publish.ts';

const owner = process.env['ORBIT_TEST_DATABASE_URL'] ?? `postgres://${process.env['USER']}@localhost/orbit2_test`;
let db: Client;
let workflowId: string;
let readId: string;
let endId: string;

before(async () => { await migrate(owner); db = new Client({ connectionString: owner }); await db.connect(); });
after(async () => { await db?.end(); });

beforeEach(async () => {
  const { rows: [w] } = await db.query<{ id: string }>(
    `INSERT INTO workflow (name, outcomes, confirmed_at) VALUES ('Configure', $1, now()) RETURNING id`,
    [JSON.stringify([{ name: 'done', label: 'Done' }])]);
  workflowId = w!.id;
  readId = crypto.randomUUID();
  endId = crypto.randomUUID();
  await db.query(
    `INSERT INTO workflow_step (id, workflow_id, position, kind, declares, complete) VALUES
       ($1, $3, 1, 'read', $4, true),
       ($2, $3, 2, 'end',  $5, true)`,
    [readId, endId, workflowId,
     JSON.stringify({ summary: 'the credit score',
       region: { label: 'Credit score', binding: { strategy: 'structural', name: 'Credit score', corroborate: { tag: 'div' } } },
       produces: { name: 'creditScore', label: 'Credit score', type: 'number', required: true } }),
     JSON.stringify({ summary: 'done', outcome: 'done', publishes: ['creditScore'] })]);
});

const stepIn = async (id: string) => {
  const { rows: [row] } = await db.query<{ id: string; kind: string; declares: Record<string, unknown>; complete: boolean }>(
    `SELECT id, kind, declares, complete FROM workflow_step WHERE id = $1`, [id]);
  return row!;
};

test('an added step is unfinished, and configuring it finishes it', async () => {
  const added = await insertStep(db as never, workflowId, 'end', 2);
  assert.equal(added.ok, true);
  const id = added.ok === true ? added.id : '';

  assert.ok('incomplete' in asDraftStep(await stepIn(id)), 'it arrives saying nothing');

  const result = await configureStep(db as never, workflowId, id, {
    kind: 'end', summary: 'Declined for a low credit score',
    outcome: 'declined', publishes: ['creditScore'],
  });
  assert.equal(result.ok, true);

  const saved = await stepIn(id);
  assert.equal(saved.complete, true);
  assert.ok(!('incomplete' in asDraftStep(saved)), 'and now it parses');
  assert.equal(saved.declares['outcome'], 'declined');
});

test('an author cannot say how a step finds anything', async () => {
  // The whole point. `object()` is a strict object, so a binding arriving
  // anyway is refused at the boundary rather than dropped silently — the
  // guarantee is the shape of the type, not a rule somebody remembers.
  const added = await insertStep(db as never, workflowId, 'end', 2);
  const id = added.ok === true ? added.id : '';

  for (const smuggled of [
    { binding: { strategy: 'css', name: '#approve' } },
    { strategy: 'text' },
    { region: { label: 'x', binding: {} } },
  ]) {
    const result = await configureStep(db as never, workflowId, id, {
      kind: 'end', summary: 'done', outcome: 'declined', publishes: [], ...smuggled,
    });
    assert.equal(result.ok, false, `refused ${JSON.stringify(smuggled)}`);
  }
});

test("a step's kind is fixed when it is added", async () => {
  const added = await insertStep(db as never, workflowId, 'end', 2);
  const id = added.ok === true ? added.id : '';
  const result = await configureStep(db as never, workflowId, id, {
    kind: 'check', summary: 'x',
    that: { of: 'number', operator: 'isAtLeast',
      left: { from: 'step', value: 'creditScore' }, right: { from: 'literal', literal: { type: 'number', number: 620 } } },
    otherwise: 'too low',
  });
  assert.equal(result.ok, false);
  assert.match(result.because, /kind is fixed/);
});

test('a branch that strands a step is refused, naming every consequence', async () => {
  // `editStep` had no such gate — `moveStep` and `deleteStep` both did — and
  // configuring a branch is the first edit that can change the graph.
  const added = await insertStep(db as never, workflowId, 'branch', 1);
  const id = added.ok === true ? added.id : '';

  const result = await configureStep(db as never, workflowId, id, {
    kind: 'branch', summary: 'Is the score at least 620?',
    when: { of: 'number', operator: 'isAtLeast',
      left: { from: 'step', value: 'creditScore' }, right: { from: 'literal', literal: { type: 'number', number: 620 } } },
    ifTrue: endId, ifFalse: endId,
  });
  assert.equal(result.ok, false);
  assert.match(result.because, /same step/);

  assert.ok('incomplete' in asDraftStep(await stepIn(id)), 'and nothing was written');
});

test('a branch can only go to a step of this same agent', async () => {
  const added = await insertStep(db as never, workflowId, 'branch', 1);
  const id = added.ok === true ? added.id : '';
  const result = await configureStep(db as never, workflowId, id, {
    kind: 'branch', summary: 'x',
    when: { of: 'number', operator: 'isAtLeast',
      left: { from: 'step', value: 'creditScore' }, right: { from: 'literal', literal: { type: 'number', number: 620 } } },
    ifTrue: endId, ifFalse: crypto.randomUUID(),
  });
  assert.equal(result.ok, false);
  assert.match(result.because, /this same agent/);
});

test('configuring a step returns a confirmed workflow to draft', async () => {
  const added = await insertStep(db as never, workflowId, 'end', 2);
  const id = added.ok === true ? added.id : '';
  await db.query(`UPDATE workflow SET confirmed_at = now() WHERE id = $1`, [workflowId]);

  await configureStep(db as never, workflowId, id, {
    kind: 'end', summary: 'declined', outcome: 'declined', publishes: [],
  });

  const { rows: [w] } = await db.query<{ confirmed_at: string | null }>(
    `SELECT confirmed_at FROM workflow WHERE id = $1`, [workflowId]);
  assert.equal(w!.confirmed_at, null, 'confirmation refers to a set of steps; change them and it lapses');
});

test('confirming does not declare a step finished without reading it', async () => {
  // The regression. `confirm` wrote the outcome with `jsonb_set` and set
  // `complete = true` unconditionally, so a hand-added ending — which also
  // needs `publishes` — came through marked finished and was then refused at
  // publication for the field it never had. The column said one thing and the
  // gate said another.
  const added = await insertStep(db as never, workflowId, 'end', 2);
  const id = added.ok === true ? added.id : '';
  await db.query(`UPDATE workflow SET confirmed_at = NULL WHERE id = $1`, [workflowId]);

  const confirmed = await confirm(db as never, workflowId, {
    attested: true, answers: [],
    endings: [
      { stepId: endId, outcome: 'done', label: 'Done', example: {} },
      { stepId: id, outcome: 'declined', label: 'Declined', example: {} },
    ],
  });
  assert.equal(confirmed.outcome, 'confirmed');

  const saved = await stepIn(id);
  assert.equal(saved.complete, false, 'it still does not say what it carries');

  const minted = await mintVersion(db as never, workflowId);
  assert.equal(minted.outcome, 'refused');
  assert.ok(minted.outcome === 'refused' && minted.blockers.some((b) => b.kind === 'stepIncomplete'),
    'and the gate says so, as it always did');
});

test('a configured check publishes and the version carries it', async () => {
  // A `check` is the cheapest proof that the whole path works: it needs no
  // page, it changes nothing about reachability, and it is refused by
  // publication until it says what it compares.
  const added = await insertStep(db as never, workflowId, 'check', 1);
  const id = added.ok === true ? added.id : '';

  const before = await mintVersion(db as never, workflowId);
  assert.equal(before.outcome, 'refused', 'unconfigured, it blocks publication');

  const result = await configureStep(db as never, workflowId, id, {
    kind: 'check', summary: 'The score is at least 620',
    that: { of: 'number', operator: 'isAtLeast',
      left: { from: 'step', value: 'creditScore' },
      right: { from: 'literal', literal: { type: 'number', number: 620 } } },
    otherwise: 'The credit score is below the program floor',
  });
  assert.equal(result.ok, true);

  const confirmed = await confirm(db as never, workflowId, {
    attested: true, answers: [],
    endings: [{ stepId: endId, outcome: 'done', label: 'Done', example: {} }],
  });
  assert.equal(confirmed.outcome, 'confirmed');

  const minted = await mintVersion(db as never, workflowId);
  assert.equal(minted.outcome, 'published',
    minted.outcome === 'refused' ? minted.blockers.map((b) => b.kind).join(', ') : '');

  // And the version carries the step as configured, not as inserted.
  const { rows: [v] } = await db.query<{ body: { steps: Array<{ kind: string; otherwise?: string }> } }>(
    `SELECT body FROM workflow_version WHERE workflow_id = $1 ORDER BY version DESC LIMIT 1`, [workflowId]);
  const check = v!.body.steps.find((x) => x.kind === 'check');
  assert.equal(check?.otherwise, 'The credit score is below the program floor');
});
