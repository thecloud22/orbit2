/**
 * A labelling is kept only if it places every sentence exactly once. The
 * refusals are the point: a model that skipped one sentence, or labelled one
 * twice, or answered about a sentence that does not exist, has to be caught
 * here, before a person reads its answer as a complete account.
 */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { checkLabelling, coverage, nextPartKey, sentenceNumber, type SentenceLabel } from './procedure.ts';

const entry = (sentence: string, label = 'task') => ({ sentence, label, reason: 'says to do it', basis: 'stated' });
const expected = ['1.1', '1.2', '1.3'];

test('a labelling that places every sentence once is kept', () => {
  const checked = checkLabelling(expected, expected.map((n) => entry(n)));
  assert.equal(checked.ok, true);
});

test('a skipped sentence is named', () => {
  assert.deepEqual(checkLabelling(expected, [entry('1.1'), entry('1.3')]),
    { ok: false, skipped: ['1.2'], duplicated: [], invented: [] });
});

test('a sentence labelled twice is named', () => {
  assert.deepEqual(checkLabelling(expected, [entry('1.1'), entry('1.2'), entry('1.2', 'rule'), entry('1.3')]),
    { ok: false, skipped: [], duplicated: ['1.2'], invented: [] });
});

test('a sentence that does not exist is named', () => {
  assert.deepEqual(checkLabelling(expected, [...expected.map((n) => entry(n)), entry('1.4')]),
    { ok: false, skipped: [], duplicated: [], invented: ['1.4'] });
});

test('every problem is named at once, not the first', () => {
  const checked = checkLabelling(expected, [entry('1.1'), entry('1.1'), entry('2.7')]);
  assert.deepEqual(checked, { ok: false, skipped: ['1.2', '1.3'], duplicated: ['1.1'], invented: ['2.7'] });
});

test('an answer outside the shape is refused, and says where', () => {
  const checked = checkLabelling(expected, [{ ...entry('1.1'), label: 'probablyATask' }]);
  assert.equal(checked.ok, false);
  assert.match(checked.ok ? '' : checked.malformed ?? '', /0\.label/);
  assert.equal(checkLabelling(expected, [{ ...entry('1.1'), note: 'extra' }]).ok, false,
    'an unknown key is refused, not dropped');
  assert.equal(checkLabelling(expected, 'all tasks').ok, false);
});

test('coverage is counted from the labels', () => {
  const labels = new Map<string, SentenceLabel>([['1.1', 'task'], ['1.2', 'rule'], ['A.1', 'task']]);
  assert.deepEqual(coverage(['1.1', '1.2', '1.3', 'A.1'], labels), {
    total: 4, placed: 3, unplaced: ['1.3'],
    byLabel: { task: 2, rule: 1, forAPerson: 0, background: 0, wontDo: 0 },
  });
});

test('parts are numbered for the document and lettered for the author', () => {
  assert.equal(nextPartKey([], 'pasted'), '1');
  assert.equal(nextPartKey(['1', 'A'], 'pdf'), '2');
  assert.equal(nextPartKey(['1', '2'], 'author'), 'A');
  assert.equal(nextPartKey(['1', 'A', 'B'], 'author'), 'C');
  const letters = Array.from({ length: 26 }, (_, i) => String.fromCharCode(65 + i));
  assert.equal(nextPartKey(letters, 'author'), 'AA');
});

test('a sentence number says its part and its place', () => {
  for (const ok of ['1.1', '2.14', 'A.1', 'AB.3']) assert.equal(sentenceNumber.safeParse(ok).success, true, ok);
  for (const bad of ['0.1', '1.0', '1', 'a.1', '1.1.1', ' 1.1']) assert.equal(sentenceNumber.safeParse(bad).success, false, bad);
});
