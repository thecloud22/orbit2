/**
 * Values named in the author's words (Decision 20), checked against the M1
 * draft's own sentences: scenario 2, the underwriting risk review.
 */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { linksOf, namedIn, phraseFor, placeOf } from './links.ts';
import { checkRuleTables, type RuleTable } from './procedure.ts';

const s19 = '3. Read the loan program, the credit score, the debt-to-income ratio, the loan amount and the FEMA flood zone.';
const s110 = '4. If the credit score is below 620, decline the file citing a low credit score.';
const s114 = '6. If the loan amount is over $806,500 and the program is not jumbo, refer the file to a senior underwriter.';
const sentences = [
  { number: '1.9', text: s19, label: 'task' },
  { number: '1.10', text: s110, label: 'rule' },
  { number: '1.13', text: 'Do not attach conditions to a referred file.', label: 'background' },
  { number: '1.14', text: s114, label: 'rule' },
];

test('a phrase is linked only where it is once, exactly as written', () => {
  assert.deepEqual(placeOf(s114, 'the program'), { at: s114.indexOf('the program') });
  assert.deepEqual(placeOf(s114, 'The program'), { refused: 'absent' });
  assert.deepEqual(placeOf(s110, 'credit score'), { refused: 'twice' });
  assert.deepEqual(placeOf(s110, 'the credit score'), { at: 6 });
});

test('a label is found as the sentence writes it, with its "the", at word edges', () => {
  assert.equal(phraseFor(s19, 'Loan program'), 'the loan program');
  assert.equal(phraseFor(s19, 'Debt-to-income'), 'the debt-to-income');
  assert.equal(phraseFor(s19, 'FEMA flood zone'), 'the FEMA flood zone');
  // "program" is also inside "loan program": a label found twice gives nothing.
  assert.equal(phraseFor(s114, 'program'), 'the program');
  assert.equal(phraseFor(`${s114} The program is FHA.`, 'program'), null);
  assert.equal(phraseFor(s19, 'income ratio'), null, 'not across "debt-to-income"');
});

const table: RuleTable = {
  question: 'What is the file decision?',
  columns: [{ name: 'loanAmount', label: 'loan amount', readBy: '1.9' }, { name: 'loanProgram', label: 'loan program', readBy: '1.9' }],
  rows: [{ when: [{ column: 'loanAmount', is: 'isMoreThan', value: '$806,500' }, { column: 'loanProgram', is: 'isNot', value: 'jumbo' }],
    then: 'refer the file to a senior underwriter.', sentence: '1.14' }],
  otherwise: null,
  sentences: ['1.14'],
};
const reads = [
  { sentence: '1.9', label: 'Loan program', name: 'loanProgram' },
  { sentence: '1.9', label: 'Credit score', name: 'creditScore' },
  { sentence: '1.9', label: 'Loan amount', name: 'amount' },
];

test("Orbit's guesses come from the reads first, then the columns, only in task and rule sentences", () => {
  const links = linksOf({ sentences, authored: [], tables: [table], reads });
  assert.deepEqual(links, [
    { sentence: '1.9', phrase: 'the loan program', value: 'loanProgram', by: 'orbit' },
    { sentence: '1.9', phrase: 'the credit score', value: 'creditScore', by: 'orbit' },
    // The read named it amount; the column's loanAmount does not overrule a value that exists,
    // and the rule's words are guessed as the same value, never as a second name for it.
    { sentence: '1.9', phrase: 'the loan amount', value: 'amount', by: 'orbit' },
    { sentence: '1.14', phrase: 'the loan amount', value: 'amount', by: 'orbit' },
  ]);
  assert.deepEqual(linksOf({ sentences, authored: [], tables: [table], reads: [] }).map((l) => l.value), ['loanProgram', 'loanAmount', 'loanAmount'],
    'before anything is read, a column is guessed by its own name');
});

test("the author's latest word holds, overrules a guess on the same words, and lapses with its phrase", () => {
  const links = linksOf({ sentences, tables: [table], reads, authored: [
    { sentence: '1.14', phrase: 'the program', value: 'programCode' },
    { sentence: '1.14', phrase: 'the program', value: 'loanProgram' },
    { sentence: '1.9', phrase: 'loan amount', value: 'loanAmount' },
    { sentence: '1.9', phrase: 'the credit score', value: null },
    { sentence: '1.10', phrase: 'the credit rating', value: 'creditScore' },
    { sentence: '1.13', phrase: 'a referred file', value: 'referred' },
  ] });
  assert.deepEqual(links, [
    { sentence: '1.9', phrase: 'the loan program', value: 'loanProgram', by: 'orbit' },
    { sentence: '1.9', phrase: 'the credit score', value: null, by: 'author' },
    { sentence: '1.9', phrase: 'loan amount', value: 'loanAmount', by: 'author' },
    { sentence: '1.14', phrase: 'the loan amount', value: 'amount', by: 'orbit' },
    { sentence: '1.14', phrase: 'the program', value: 'loanProgram', by: 'author' },
  ]);
  assert.deepEqual(namedIn(links, ['1.14']), [{ sentence: '1.14', phrase: 'the program', value: 'loanProgram' }]);
});

test('a set of tables with no column for a value the author named is refused, saying so', () => {
  const named = [{ sentence: '1.14', phrase: 'the program', value: 'programCode' }];
  const checked = checkRuleTables(['1.14'], ['1.9'], [table], named);
  assert.deepEqual(checked.ok ? [] : checked.problems,
    ['table 1: 1.14 says "the program" is programCode, and no column is named programCode']);
  assert.equal(checkRuleTables(['1.14'], ['1.9'], [table], [{ ...named[0]!, value: 'loanProgram' }]).ok, true);
});
