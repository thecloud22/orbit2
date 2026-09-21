/**
 * What an `enter` step puts in, from what the model called it.
 *
 * The model is asked for "the name of the input it comes from", and a
 * procedure does not always have one. "Open the file ML-26-04502" names the
 * record it works on, so the honest answer is the number — which is not a
 * name, and went into a field the contract requires to be an identifier. The
 * whole interpretation was discarded over it, with a message about lower-case
 * letters.
 */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { step as stepSchema } from '@orbit/contract';
import { forTest } from './author.ts';

const { valueToEnter } = forTest;
const procedure = 'Go to the site, then open the file ML-26-04502. '
  + 'Once you go there, extract credit score, Debt-to-income, Loan-to-value.';

test('a name is taken as the input it names', () => {
  assert.deepEqual(valueToEnter('loanNumber', procedure), { from: 'input', value: 'loanNumber' });
});

test('a value the author wrote is taken as a literal, not discarded', () => {
  // The case that lost a whole interpretation.
  assert.deepEqual(valueToEnter('ML-26-04502', procedure),
    { from: 'literal', literal: { type: 'text', text: 'ML-26-04502' } });
});

test('a label given where a name was wanted becomes a name', () => {
  assert.deepEqual(valueToEnter('Loan Number', 'Enter the loan number.'),
    { from: 'input', value: 'loanNumber' });
});

test('something that is neither is refused, rather than guessed at', () => {
  // Not in the procedure, and nothing survives being made into a name.
  assert.equal(valueToEnter('###', 'Enter the loan number.'), null);
});

test('whatever it decides, the step it builds is one the contract accepts', () => {
  // The point of the whole exercise: the refusal happened because a step was
  // built that could not be parsed. Each reading is checked as a real step.
  for (const given of ['loanNumber', 'ML-26-04502', 'Loan Number']) {
    const value = valueToEnter(given, procedure);
    assert.ok(value, given);
    const parsed = stepSchema.safeParse({
      id: crypto.randomUUID(), kind: 'enter', summary: `${given}, into Search`,
      into: { label: 'Search', binding: { strategy: 'roleAndName', role: 'textbox', name: 'Search' } },
      value, sensitive: false,
    });
    assert.equal(parsed.success, true, `${given}: ${JSON.stringify(parsed.error?.issues)}`);
  }
});

test('a literal is one the executor can actually type', () => {
  // execute.ts resolves only text literals; a number or date literal would
  // type an empty string, which is the silent half of the same defect.
  const value = valueToEnter('ML-26-04502', procedure);
  assert.equal(value && 'literal' in value && value.literal.type, 'text');
});
