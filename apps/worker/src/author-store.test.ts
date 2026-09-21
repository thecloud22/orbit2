/**
 * Acceptance criterion 2: "An interpretation that fails validation stores
 * **nothing** — not the valid parts — and says so."
 *
 * The emphasis carries the requirement. Keeping the steps that happened to
 * validate would hand the author a procedure with a hole in it and no marker
 * where the hole is — a workflow that was never a reading of their text, but
 * looks exactly like one that was.
 *
 * So these tests do not check that an error was raised. They check the five
 * tables afterwards and insist every one of them is untouched.
 */
import { strict as assert } from 'node:assert';
import { after, before, test } from 'node:test';
import { Client } from 'pg';
import { migrate } from '../../api/src/migrate.ts';
import { storeDraft } from './author-store.ts';
import { asQuestion } from './note.ts';
import type { AuthoredDraft } from './author.ts';

const owner = process.env['ORBIT_TEST_DATABASE_URL'] ?? `postgres://${process.env['USER']}@localhost/orbit2_test`;
let db: Client;

before(async () => {
  await migrate(owner);
  db = new Client({ connectionString: owner });
  await db.connect();
});
after(async () => { await db?.end(); });

const aStep = (summary: string) => ({
  id: crypto.randomUUID(), kind: 'read' as const, summary,
  region: { label: 'Status', binding: { strategy: 'roleAndName', role: 'heading', name: 'Status' } },
  produces: { name: 'status', label: 'Status', type: 'text' as const, required: false },
});

/** A named interpretation, ready to be offered to the store. */
const interpretation = (draft: Partial<AuthoredDraft>) => ({
  opts: { name: `Criterion 2 ${crypto.randomUUID().slice(0, 6)}`,
          procedure: 'Open the pipeline and record the status.' },
  draft: { declaredInputs: [], questions: [], turns: [], steps: [], ...draft } as AuthoredDraft,
});

/** Nothing anywhere. Counted per table, because "stores nothing" is a claim
 *  about all of them and a transaction that half-committed would show here. */
async function nothingStoredFor(name: string) {
  const counts = await db.query<{ workflows: string; steps: string; notes: string; calls: string; audits: string }>(
    `SELECT (SELECT count(*) FROM workflow WHERE name = $1) AS workflows,
            (SELECT count(*) FROM workflow_step s JOIN workflow w ON w.id = s.workflow_id WHERE w.name = $1) AS steps,
            (SELECT count(*) FROM workflow_note n JOIN workflow w ON w.id = n.workflow_id WHERE w.name = $1) AS notes,
            (SELECT count(*) FROM model_call c JOIN workflow w ON w.id = c.workflow_id WHERE w.name = $1) AS calls,
            (SELECT count(*) FROM audit_entry a JOIN workflow w ON w.id = a.object_id WHERE w.name = $1) AS audits`,
    [name]);
  return counts.rows[0]!;
}

test('an interpretation with one bad step stores none of the good ones', async () => {
  const { opts, draft } = interpretation({
    steps: [aStep('the status'), { id: crypto.randomUUID(), kind: 'activate', summary: 'press it' } as never,
            aStep('the queue')],
    declaredInputs: [], questions: [asQuestion('something the model could not settle')],
    turns: [{ turn: 1, provider: 'test', model: 'test', shown: { page: '/pipeline', elements: 3, asking: 'what next?' }, answered: null,
              verdict: 'kept', why: 'a step', tokensIn: 1, tokensOut: 1, costMicros: 1 }],
  });

  const result = await storeDraft(db as never, opts, draft);
  assert.equal(result.stored, false, 'refused');

  const counts = await nothingStoredFor(opts.name);
  assert.equal(Number(counts.workflows), 0, 'no workflow');
  assert.equal(Number(counts.steps), 0, 'and not the two steps that were perfectly valid');
  assert.equal(Number(counts.notes), 0, 'nor the question it raised');
  assert.equal(Number(counts.calls), 0);
  assert.equal(Number(counts.audits), 0, 'and nothing claiming a procedure was brought in');
});

test('the refusal says which step and what was wrong with it', async () => {
  // "And says so" is half the criterion. A refusal that does not name the step
  // leaves the author with the same text and nothing to change.
  const { opts, draft } = interpretation({
    steps: [{ id: crypto.randomUUID(), kind: 'activate', summary: 'press it' } as never],
    declaredInputs: [], questions: [], turns: [],
  });

  const result = await storeDraft(db as never, opts, draft);
  assert.equal(result.stored, false);
  if (result.stored !== false) return;

  assert.equal(result.problems.length, 1);
  assert.equal(result.problems[0]!.step, 1);
  assert.equal(result.problems[0]!.kind, 'activate');
  assert.ok(result.problems[0]!.wrong.length > 0, 'and what was missing from it');
  assert.match(result.describe, /Step 1 \(activate\)/);
  assert.match(result.describe, /none of it was kept/);
});

test('every bad step is named, not the first', async () => {
  const { opts, draft } = interpretation({
    steps: [{ id: crypto.randomUUID(), kind: 'activate', summary: 'one' } as never,
            aStep('fine'),
            { id: crypto.randomUUID(), kind: 'enter', summary: 'three' } as never],
    declaredInputs: [], questions: [], turns: [],
  });

  const result = await storeDraft(db as never, opts, draft);
  assert.equal(result.stored, false);
  if (result.stored !== false) return;
  assert.deepEqual(result.problems.map((p) => p.step), [1, 3]);
});

test('an interpretation that holds together is stored, with its reasoning', async () => {
  // The other side of the same rule: a draft that validates lands whole —
  // steps, questions and turns in one transaction, because a draft without its
  // reasoning is not half a result, it is a result nobody can check.
  const { opts, draft } = interpretation({
    steps: [aStep('the status')],
    declaredInputs: [{ name: 'reference', label: 'Reference', type: 'text', required: true }],
    questions: [asQuestion('what should this be called when it finishes this way?')],
    turns: [{ turn: 1, provider: 'test', model: 'test', shown: { page: '/pipeline', elements: 3, asking: 'what next?' }, answered: null,
              verdict: 'kept', why: 'a step', tokensIn: 1, tokensOut: 1, costMicros: 1 },
            { turn: 2, provider: 'test', model: 'test', shown: { page: '/pipeline', elements: 3, asking: 'what next?' }, answered: null,
              verdict: 'rejected', why: 'named something not on the page', tokensIn: 1, tokensOut: 1, costMicros: 1 }],
  });

  const result = await storeDraft(db as never, opts, draft);
  assert.equal(result.stored, true);

  const counts = await nothingStoredFor(opts.name);
  assert.equal(Number(counts.workflows), 1);
  assert.equal(Number(counts.steps), 1);
  assert.equal(Number(counts.notes), 1);
  assert.equal(Number(counts.calls), 2, 'including the turn that produced nothing usable');
});
