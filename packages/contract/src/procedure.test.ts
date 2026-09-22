/**
 * A labelling is kept only if it places every sentence exactly once. The
 * refusals are the point: a model that skipped one sentence, or labelled one
 * twice, or answered about a sentence that does not exist, has to be caught
 * here, before a person reads its answer as a complete account.
 */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
  checkLabelling, checkRuleTables, coverage, nextPartKey, sentenceNumber, unreadColumns, type SentenceLabel,
} from './procedure.ts';

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


const aTable = (over: Record<string, unknown> = {}) => ({
  question: 'What do we tell the caller?',
  columns: [{ name: 'claimFound', label: 'Claim found', readBy: '1.2' }, { name: 'outstanding', label: 'Outstanding', readBy: null }],
  rows: [{ when: [{ column: 'claimFound', is: 'is', value: 'no' }], then: 'No such claim', sentence: '1.3' },
         { when: [{ column: 'outstanding', is: 'isMoreThan', value: '10000' }], then: 'Team lead', sentence: '1.4' }],
  otherwise: { then: 'Tell the status', sentence: null },
  sentences: ['1.3', '1.4'],
  ...over,
});

test('a table accounting for every rule sentence once is kept', () => {
  const checked = checkRuleTables(['1.3', '1.4'], ['1.1', '1.2'], [aTable()]);
  assert.equal(checked.ok, true);
  assert.deepEqual(unreadColumns(checked.ok ? checked.tables : []),
    [{ table: 1, question: 'What do we tell the caller?', label: 'Outstanding', sentences: ['1.3', '1.4'] }]);
});

test('every problem with a set of tables is named', () => {
  const checked = checkRuleTables(['1.3', '1.4', '1.5'], ['1.1', '1.2'], [aTable({
    columns: [{ name: 'claimFound', label: 'Claim found', readBy: '1.3' }],
    rows: [{ when: [{ column: 'age', is: 'isMoreThan', value: null }], then: 'x', sentence: '1.9' }],
  })]);
  assert.equal(checked.ok, false);
  assert.deepEqual(checked.ok ? [] : checked.problems, [
    'table 1: "Claim found" is said to be read by 1.3, which is not a task',
    'table 1 row 1 cites 1.9, which the table does not',
    'table 1 row 1 compares "age", which is not one of its columns',
    'table 1 row 1 compares "age" with nothing',
    'rule sentence 1.5 is in no table',
  ]);
});
