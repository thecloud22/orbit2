/**
 * The measure a change of model is decided on, so it is tested like the
 * product: agreement counts, every disagreement is named, and a sentence the
 * person gave Orbit that the model did not is called out on its own.
 */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import type { SentenceLabel } from '@orbit/contract';
import { score } from './sort-score.ts';

const person: Record<string, SentenceLabel> = { '1.1': 'background', '1.2': 'task', '1.3': 'rule', '1.4': 'forAPerson' };

test('full agreement', () => {
  const s = score(person, new Map(Object.entries(person)));
  assert.equal(s.agreed, 4);
  assert.deepEqual(s.disagreements, []);
});

test('each disagreement is named, and one that drops a task from the walk is called out', () => {
  const s = score(person, new Map<string, SentenceLabel>([
    ['1.1', 'background'], ['1.2', 'background'], ['1.3', 'task'], ['1.4', 'wontDo']]));
  assert.equal(s.agreed, 1);
  assert.deepEqual(s.disagreements.map((d) => d.sentence), ['1.2', '1.3', '1.4']);
  assert.deepEqual(s.lostFromTheWalk, ['1.2'], 'a rule sorted as a task still reaches the walk');
  assert.equal(s.confusion.task.background, 1);
});

test('a sentence the sort did not label is an error, not a disagreement', () => {
  assert.throws(() => score(person, new Map([['1.1', 'background' as SentenceLabel]])), /no label for 1\.2/);
});
