/**
 * Deciding a comparison, and refusing to decide one that cannot be.
 *
 * This is the part of the executor where a wrong answer would be delivered
 * confidently. Until now only absence was implemented and everything else fell
 * through to "is the left side present", so a branch on "credit score is more
 * than 700" took the yes path for any score at all — and recorded that the
 * comparison had gone that way.
 */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import type { Comparison } from '@orbit/contract';
import { asNumber, decide } from './compare.ts';

const value = (v: string | null) => () => v;
const pair = (left: string, right: string) => (ref: { from: string }) =>
  (ref.from === 'step' ? left : right);

// ── the screen does not show numbers ──────────────────────────────────────

test('a number written for a person is still a number', () => {
  assert.equal(asNumber('744'), 744);
  assert.equal(asNumber('32.50%'), 32.5);
  assert.equal(asNumber('$457,500'), 457500);
  assert.equal(asNumber('  6.625% '), 6.625);
  assert.equal(asNumber('-12'), -12);
});

test('something that is not a number is refused rather than salvaged', () => {
  // Each of these could be turned into a number by guessing, and the guess is
  // the problem: "700-750" is a range, and reading it as 700 decides a loan.
  for (const raw of ['about 700', 'N/A', '700-750', '', '7.0.0', '1,2,3.4.5']) {
    assert.equal(asNumber(raw), null, raw);
  }
});

// ── numbers ───────────────────────────────────────────────────────────────

test('a credit score above the threshold holds, and one below does not', () => {
  const when = { of: 'number', operator: 'isMoreThan',
    left: { from: 'step', value: 'creditScore' },
    right: { from: 'literal', literal: { type: 'number', number: 700 } } } as Comparison;

  assert.equal((decide(when, pair('744', '700')) as { held: boolean }).held, true);
  assert.equal((decide(when, pair('680', '700')) as { held: boolean }).held, false);
  // The boundary, stated rather than left to be discovered: isMoreThan is not
  // isAtLeast.
  assert.equal((decide(when, pair('700', '700')) as { held: boolean }).held, false);
});

test('a percentage on the screen compares against the threshold it is written as', () => {
  const when = { of: 'number', operator: 'isLessThan',
    left: { from: 'step', value: 'debtToIncome' },
    right: { from: 'literal', literal: { type: 'number', number: 30 } } } as Comparison;

  assert.equal((decide(when, pair('32.50%', '30')) as { held: boolean }).held, false);
  assert.equal((decide(when, pair('28.10%', '30')) as { held: boolean }).held, true);
});

test('both operands are kept exactly as they arrived', () => {
  // §10. A comparison that went the wrong way is only fixable because these
  // are on the record — the parsed number is not what the screen said.
  const when = { of: 'number', operator: 'isLessThan',
    left: { from: 'step', value: 'loanToValue' },
    right: { from: 'literal', literal: { type: 'number', number: 70 } } } as Comparison;

  const decided = decide(when, pair('75.00%', '70'));
  assert.equal(decided.decided, true);
  assert.equal(decided.decided === true && decided.left, '75.00%', 'not 75');
  assert.equal(decided.decided === true && decided.right, '70');
});

test('a value that is not a number halts rather than comparing as one', () => {
  const when = { of: 'number', operator: 'isMoreThan',
    left: { from: 'step', value: 'creditScore' },
    right: { from: 'literal', literal: { type: 'number', number: 700 } } } as Comparison;

  const decided = decide(when, pair('Not scored', '700'));
  assert.equal(decided.decided, false);
  assert.equal(decided.decided === false && decided.kind, 'valueNotOfDeclaredType');
  assert.match(decided.decided === false ? decided.describe : '', /"Not scored"/,
    'and says what it read, because that is what makes it fixable');
});

// ── absence ───────────────────────────────────────────────────────────────

test('absence is the only thing an absent value may be compared with', () => {
  const absent = { of: 'absence', operator: 'isAbsent',
    left: { from: 'step', value: 'noteRate' } } as Comparison;
  assert.equal((decide(absent, value(null)) as { held: boolean }).held, true);
  assert.equal((decide(absent, value('6.375%')) as { held: boolean }).held, false);

  // Decision 14 item 2: without this, "there was no record" and "the record
  // said nothing" collapse into each other.
  const numeric = { of: 'number', operator: 'isMoreThan',
    left: { from: 'step', value: 'creditScore' },
    right: { from: 'literal', literal: { type: 'number', number: 700 } } } as Comparison;
  const decided = decide(numeric, value(null));
  assert.equal(decided.decided, false);
  assert.equal(decided.decided === false && decided.kind, 'comparisonNotPossible');
});

// ── the other types ───────────────────────────────────────────────────────

test('text compares as text, and does not quietly become a number', () => {
  const when = { of: 'text', operator: 'is',
    left: { from: 'step', value: 'status' },
    right: { from: 'literal', literal: { type: 'text', text: 'In underwriting' } } } as Comparison;
  assert.equal((decide(when, pair('In underwriting', 'In underwriting')) as { held: boolean }).held, true);
  assert.equal((decide(when, pair('Approved', 'In underwriting')) as { held: boolean }).held, false);
});

test('yes or no means the two words it means, and nothing else', () => {
  const when = { of: 'yesNo', operator: 'is',
    left: { from: 'step', value: 'firstTimeBuyer' },
    right: { from: 'literal', literal: { type: 'yesNo', yesNo: true } } } as Comparison;

  assert.equal((decide(when, pair('Yes', 'yes')) as { held: boolean }).held, true);
  assert.equal((decide(when, pair('No', 'yes')) as { held: boolean }).held, false);

  // "1" and "checked" are things a page says and not things this type means.
  // Guessing which way they go is how a decision quietly inverts.
  const decided = decide(when, pair('checked', 'yes'));
  assert.equal(decided.decided, false);
  assert.equal(decided.decided === false && decided.kind, 'valueNotOfDeclaredType');
});

test('text is compared as a person reads it: letter case and surrounding space do not count', () => {
  const when = (operator: 'is' | 'isNot', text: string) => ({ of: 'text', operator,
    left: { from: 'step', value: 'loanProgram' }, right: { from: 'literal', literal: { type: 'text', text } } }) as never;
  const read = (ref: { from: string }) => (ref.from === 'step' ? 'Jumbo ' : 'jumbo');
  assert.equal((decide(when('is', 'jumbo'), read) as { held: boolean }).held, true);
  assert.equal((decide(when('isNot', 'jumbo'), read) as { held: boolean }).held, false);
  assert.equal((decide(when('is', 'jumbo'), read) as { left: string }).left, 'Jumbo ', 'kept exactly as read');
});
