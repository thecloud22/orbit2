/**
 * Values as objects (procedure editor R26): a run hands back `{ loan: { ltv } }`,
 * and a value that belongs to no object, or that would take a field already
 * taken, keeps its own name rather than being dropped or merged.
 */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { asObjects, declaredValue, fieldsOf } from './values.ts';

test('values are handed back as the objects they belong to', () => {
  const shaped = asObjects({ loanNumber: 'ML-1', ltv: 82.4, creditScore: 741, note: 'x', other: 1 }, [
    { name: 'loanNumber', of: { object: 'loan', field: 'number' } },
    { name: 'ltv', of: { object: 'loan', field: 'ltv' } },
    { name: 'creditScore', of: { object: 'borrower', field: 'creditScore' } },
    { name: 'other', of: { object: 'loan', field: 'ltv' } },
  ]);
  assert.deepEqual(shaped, { loan: { number: 'ML-1', ltv: 82.4 }, borrower: { creditScore: 741 }, note: 'x', other: 1 });
  assert.deepEqual(fieldsOf(shaped), [['loan.number', 'ML-1'], ['loan.ltv', 82.4], ['borrower.creditScore', 741], ['note', 'x'], ['other', 1]]);
});

test('an object and a field are names, never a path somebody types', () => {
  assert.equal(declaredValue.safeParse({ name: 'ltv', label: 'LTV', type: 'number', required: true, of: { object: 'loan', field: 'ltv' } }).success, true);
  assert.equal(declaredValue.safeParse({ name: 'ltv', label: 'LTV', type: 'number', required: true, of: { object: 'loan.file', field: 'ltv' } }).success, false);
});
