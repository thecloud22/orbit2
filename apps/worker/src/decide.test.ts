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
