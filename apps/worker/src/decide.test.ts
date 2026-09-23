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

test('a word a rule compares with is taken as the page writes it, only where the page bears it out', async () => {
  const { asThePageWritesIt } = await import('./decide.ts');
  assert.deepEqual(asThePageWritesIt('first-time buyer', 'Yes', 'Yes'), { word: 'Yes', taken: true, unsure: false },
    'the example shows it');
  assert.deepEqual(asThePageWritesIt('first-time buyer', 'Yes', 'No'), { word: 'Yes', taken: true, unsure: false },
    'the other answer of a yes/no field');
  assert.deepEqual(asThePageWritesIt('completed', 'Completed', 'Completed'), { word: 'completed', taken: false, unsure: false },
    'the same word, in another case, is no rewording');
  assert.deepEqual(asThePageWritesIt('X', undefined, 'AE'), { word: 'X', taken: false, unsure: false },
    'nothing said, the procedure\'s word stands');
  assert.deepEqual(asThePageWritesIt('condominium', 'Condo', 'Single family'), { word: 'condominium', taken: false, unsure: true },
    'a rewording the page does not show is not taken, and is asked');
});
