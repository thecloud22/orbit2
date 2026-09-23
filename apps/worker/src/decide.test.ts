/**
 * What the table compiler does without a model: a threshold written with its
 * unit is compared as the number the page shows, and nothing else is touched.
 */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { withoutUnit } from './decide.ts';

test('a number written with its unit is compared as the number', () => {
  assert.equal(withoutUnit('6 months', 'number'), '6');
  assert.equal(withoutUnit('90 days', 'number'), '90');
  assert.equal(withoutUnit('$806,500', 'number'), '$806,500');
  assert.equal(withoutUnit('43%', 'number'), '43%');
  assert.equal(withoutUnit('6 months', 'text'), '6 months', 'text is compared as written');
  assert.equal(withoutUnit('X', 'number'), 'X', 'nothing numeric, nothing changed');
});

test('only a yes/no field is compared as the page writes it', async () => {
  const { asThePageWritesIt } = await import('./decide.ts');
  assert.deepEqual(asThePageWritesIt('first-time buyer', 'Yes', 'Yes'), { word: 'Yes', taken: true, unsure: false },
    'the example shows the answer');
  assert.deepEqual(asThePageWritesIt('first-time buyer', 'Yes', 'No'), { word: 'Yes', taken: true, unsure: false },
    'the other answer of a yes/no field');
  assert.deepEqual(asThePageWritesIt('X', 'AE', 'AE'), { word: 'X', taken: false, unsure: false },
    'scenario 6: a flood zone is not reworded into the example\'s own zone');
  assert.deepEqual(asThePageWritesIt('completed', 'Completed', 'Completed'), { word: 'completed', taken: false, unsure: false },
    'the same word, in another case, is no rewording');
  assert.deepEqual(asThePageWritesIt('yes', 'No', 'Yes'), { word: 'yes', taken: false, unsure: false },
    'a procedure that already says yes is not turned into no');
  assert.deepEqual(asThePageWritesIt('first-time buyer', 'first time', 'Yes'), { word: 'first-time buyer', taken: false, unsure: true },
    'an answer the field cannot give is not taken, and is asked');
});

test('an ending is always named within what a step summary takes', async () => {
  const { endingSummary } = await import('./author.ts');
  assert.equal(endingSummary(''), 'Finish — this conclusion has no name yet');
  assert.equal(endingSummary(null), 'Finish — this conclusion has no name yet');
  assert.equal(endingSummary('  Referred to a senior underwriter  '), 'Referred to a senior underwriter');
  const long = endingSummary('The file was referred to a senior underwriter because '.repeat(6));
  assert.ok(long.length <= 200 && long.endsWith('…'), long);
});

test('an otherwise that presses nothing does not end a procedure that goes on after the table', async () => {
  const { compileTables } = await import('./decide.ts');
  const id = () => crypto.randomUUID();
  const approve = id();
  const steps = [
    { id: id(), kind: 'open', summary: 'open', application: 'app', path: '/', arrives: { describe: 'open' }, changesARecord: false },
    { id: id(), kind: 'read', summary: 'LTV', region: { label: 'LTV', binding: {} },
      produces: { name: 'loanToValue', label: 'LTV', type: 'number', required: true } },
    { id: approve, kind: 'activate', summary: 'APPROVE', control: { label: 'APPROVE', binding: {} }, then: { describe: 'x' }, changesARecord: true },
    { id: id(), kind: 'end', summary: 'approved', outcome: 'approved', publishes: [] },
  ] as never[];
  const model = {
    provider: 'test', model: 'test',
    async propose() {
      return { value: { columns: [{ column: 'loanToValue', value: 'loanToValue' }], words: [], why: 'x',
        actions: [
          { action: 'Attach the condition requiring private mortgage insurance.', controls: ['ATTACH PMI'], ends: false, outcome: null, label: null },
          { action: 'No PMI condition is attached.', controls: [], ends: true, outcome: 'noPmiCondition', label: 'No PMI condition' },
        ] }, model: 'test', provider: 'test', tokensIn: 1, tokensOut: 1, tokensCached: 0, tokensCacheWritten: 0, costMicros: 1 };
    },
  };
  const compiled = await compileTables({
    tables: [{ question: 'When is PMI attached?', columns: [{ name: 'loanToValue', label: 'LTV', readBy: '1.8' }],
      rows: [{ when: [{ column: 'loanToValue', is: 'isMoreThan', value: '80' }], then: 'Attach the condition requiring private mortgage insurance.', sentence: '1.9' }],
      otherwise: { then: 'No PMI condition is attached.', sentence: null }, sentences: ['1.9'] }],
    steps, provenance: { [approve]: '1.10' }, order: ['1.8', '1.9', '1.10'],
    seen: [{ index: 1, what: 'button', role: 'key', name: 'ATTACH PMI', binding: {} as never }],
    pageUrl: 'LSV20', model: model as never, firstTurn: 1,
  });
  const kinds = compiled.steps.map((x) => (x.kind === 'end' ? `end:${x.outcome}` : x.kind === 'activate' ? x.summary : x.kind));
  assert.ok(!kinds.includes('end:noPmiCondition'), kinds.join(' → '));
  const pmi = kinds.indexOf('ATTACH PMI');
  assert.equal(kinds[pmi + 1], 'APPROVE', 'after attaching PMI the file is still approved');
});
