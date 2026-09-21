/**
 * Which rung of the ladder an element gets, and why.
 *
 * Decision 15 ordered the ladder by how often each rung is measurably wrong,
 * so falling down it unnecessarily is not a cosmetic matter: `text` was the
 * rung measured wrong most often, and a step that lands on it when a better
 * one was available is a step that will fail at run time.
 */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { shape, type Raw } from './snapshot.ts';

const raw = (over: Partial<Raw>): Raw => ({
  tag: 'button', type: null, what: 'button', role: 'button',
  name: 'Sign in', formName: null, labelledBy: null, row: null, column: null, ...over,
});

test('a heading sharing a name with a button does not cost the button its rung', () => {
  // The login page. Names were counted alone, across every kind, so "Sign in"
  // counted twice, `roleAndName` was refused, and the binding fell to `text`
  // — which then matched both at run time and failed the run with
  // controlAmbiguous, after publication had passed.
  const seen = shape([
    raw({ what: 'heading', role: 'heading', tag: 'h1' }),
    raw({}),
  ]);
  const button = seen.find((s) => s.what === 'button')!;
  assert.equal(button.binding.strategy, 'roleAndName');
  assert.equal(button.binding.name, 'Sign in');
});

test('two buttons with one name still lose the rung', () => {
  // The ambiguous-decision fixture: two real buttons, both "Approve".
  // getByRole('button', { name: 'Approve' }) finds two, so the rung is wrong
  // and the ladder must move on.
  const seen = shape([
    raw({ name: 'Approve' }),
    raw({ name: 'Approve' }),
  ]);
  assert.notEqual(seen[0]!.binding.strategy, 'roleAndName');
});

test('a name that is unique keeps the top rung', () => {
  const seen = shape([raw({ what: 'field', role: 'textbox', name: 'User ID', tag: 'input' })]);
  assert.equal(seen[0]!.binding.strategy, 'roleAndName');
  assert.equal(seen[0]!.binding.role, 'textbox');
});
