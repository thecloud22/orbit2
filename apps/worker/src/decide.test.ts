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
