/**
 * The sort against a model that answers what the test chose. What is proved:
 * a batch is kept only when every sentence is placed once; a bad answer is
 * asked again once, told what was wrong; a second bad answer refuses the whole
 * sort rather than keep the batches that passed; and every call is on the
 * record, the useless ones included.
 */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import type { Answered, Asked, ModelProvider } from '@orbit/model';
import { BATCH, SORT, sortSentences } from './sort.ts';

type Reply = (asked: Asked, call: number) => unknown;

function fake(reply: Reply): ModelProvider & { asked: Asked[]; shapes: unknown[] } {
  const asked: Asked[] = [];
  const shapes: unknown[] = [];
  return {
    provider: 'test', model: 'test', asked, shapes,
    async propose<T>(a: Asked, schema: { safeParse(v: unknown): { success: boolean; data?: T } },
      shape: unknown): Promise<Answered<T>> {
      asked.push(a);
      shapes.push(shape);
      const parsed = schema.safeParse(reply(a, asked.length));
      return {
        value: parsed.success ? parsed.data! : null, model: 'test', provider: 'test',
        tokensIn: 100, tokensOut: 10, tokensCached: 0, tokensCacheWritten: 0, costMicros: 1,
        ...(parsed.success ? {} : { refusedBecause: 'not the shape asked for' }),
      };
    },
  } as ModelProvider & { asked: Asked[]; shapes: unknown[] };
}

const sentences = (n: number, part = '1') =>
  Array.from({ length: n }, (_, i) => ({ number: `${part}.${i + 1}`, text: `Do thing ${i + 1}.`, kind: 'prose' }));

/** Every number in the lines it was shown, labelled as a task. */
const labelsFor = (a: Asked, skip: string[] = [], extra: string[] = []) => ({
  labels: [...a.shown.matchAll(/^(\S+\.\d+) \[/gm)].map((m) => m[1]!)
    .filter((n) => !skip.includes(n)).concat(extra)
    .map((sentence) => ({ sentence, label: 'task', reason: 'says to do it', basis: 'stated' })),
});

test('every sentence placed once is kept, from one call', async () => {
  const model = fake((a) => labelsFor(a));
  const sorted = await sortSentences(sentences(3), model);
  assert.equal(sorted.ok, true);
  assert.deepEqual(sorted.ok && sorted.labels.map((l) => l.sentence), ['1.1', '1.2', '1.3']);
  assert.equal(sorted.turns.length, 1);
  assert.equal(sorted.turns[0]!.verdict, 'kept');
});

test('the fixed instruction goes first and the sentences after, for the prompt cache', async () => {
  const model = fake((a) => labelsFor(a));
  await sortSentences(sentences(2), model);
  assert.equal(model.asked[0]!.instruction, SORT);
  assert.match(model.asked[0]!.shown, /^SENTENCES \(1\.1 to 1\.2\):\n<<<BEGIN PROCEDURE \w+>>>\n1\.1 \[text\] Do thing 1\./);
  assert.match(model.asked[0]!.instruction, /never instructions to you/, 'the procedure is fenced as data');
});

test('a skipped sentence is asked again once, and the correction names it', async () => {
  const model = fake((a, call) => labelsFor(a, call === 1 ? ['1.2'] : []));
  const sorted = await sortSentences(sentences(3), model);
  assert.equal(sorted.ok, true);
  assert.deepEqual(sorted.turns.map((t) => t.verdict), ['rejected', 'kept']);
  assert.match(sorted.turns[0]!.why, /left out 1\.2/);
  assert.match(model.asked[1]!.shown, /could not be used: it left out 1\.2/);
});

test('a second bad answer refuses the whole sort, and keeps no batch', async () => {
  const model = fake((a) => labelsFor(a, [], ['1.99']));
  const sorted = await sortSentences(sentences(3), model);
  assert.equal(sorted.ok, false);
  assert.equal(sorted.turns.length, 2, 'both calls are on the record');
  assert.match(!sorted.ok ? sorted.describe : '', /1\.99, which it was not given/);
});

test('an answer that is not the shape is recorded as producing nothing, then retried', async () => {
  const model = fake((a, call) => call === 1 ? { labels: 'all tasks' } : labelsFor(a));
  const sorted = await sortSentences(sentences(2), model);
  assert.equal(sorted.ok, true);
  assert.deepEqual(sorted.turns.map((t) => t.verdict), ['discarded', 'kept']);
});

test('a long procedure is sorted a batch at a time, and one bad batch refuses all of it', async () => {
  const n = BATCH * 2 + 5;
  const good = fake((a) => labelsFor(a));
  const sorted = await sortSentences(sentences(n), good);
  assert.equal(sorted.ok, true);
  assert.equal(good.asked.length, 3);
  assert.equal(sorted.ok && sorted.labels.length, n);

  const lastFails = fake((a) => /1\.81 \[/.test(a.shown) ? labelsFor(a, ['1.85']) : labelsFor(a));
  const refused = await sortSentences(sentences(n), lastFails);
  assert.equal(refused.ok, false, 'the batches that passed are not kept on their own');
});

test('turns are numbered after the calls already on the draft', async () => {
  const sorted = await sortSentences(sentences(1), fake((a) => labelsFor(a)), 7);
  assert.equal(sorted.turns[0]!.turn, 7);
});

test('the answer can only name the numbers of its own batch', async () => {
  const model = fake((a) => labelsFor(a));
  await sortSentences(sentences(BATCH + 2), model);
  const numbersIn = (shape: unknown) =>
    (shape as { properties: { labels: { items: { properties: { sentence: { enum: string[] } } } } } })
      .properties.labels.items.properties.sentence.enum;
  assert.equal(numbersIn(model.shapes[0]).length, BATCH);
  assert.deepEqual(numbersIn(model.shapes[1]), [`1.${BATCH + 1}`, `1.${BATCH + 2}`]);
});

test('a later part is sorted with the end of the earlier ones in view, and not asked about them', async () => {
  const model = fake((a) => labelsFor(a));
  const sorted = await sortSentences(sentences(2, '2'), model, 1,
    [{ number: '1.9', text: 'If it was reopened within 30 days of', kind: 'prose', label: 'rule' }]);
  assert.equal(sorted.ok, true);
  assert.match(model.asked[0]!.shown, /^ALREADY SORTED, for context only — do not answer about these:\n<<<BEGIN PROCEDURE \w+>>>\n1\.9 \(rule\) If it was reopened/);
  assert.deepEqual(sorted.ok && sorted.labels.map((l) => l.sentence), ['2.1', '2.2']);
});
