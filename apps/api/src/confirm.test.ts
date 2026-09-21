/**
 * The confirmation request, checked before it reaches the rule.
 *
 * Confirmation is the one attributable human act slice 1 has, and it arrives
 * over HTTP as whatever the caller sent. It was taken on trust and cast, so a
 * body missing `answers` reached `c.answers.map` and came back as a raw
 * TypeError — an internal fault where a refusal belonged.
 */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { confirmation } from './confirm.ts';

test('a confirmation that does not say what it is confirming is refused, not raised', () => {
  const given = confirmation.safeParse({});
  assert.equal(given.success, false);
  assert.ok(given.success === false && given.error.issues.some((i) => i.path[0] === 'answers'),
    'and it names what was missing');
});

test('a confirmation carrying an unknown field is refused rather than quietly trimmed', () => {
  // strictObject, as everywhere else: a caller who sent `attest` instead of
  // `attested` should be told, not silently treated as not having attested —
  // which would turn a typo into a missing attestation nobody notices.
  const given = confirmation.safeParse({ endings: [], answers: [], attested: true, attest: true });
  assert.equal(given.success, false);
});

test('a complete confirmation parses, and keeps the example values', () => {
  const given = confirmation.safeParse({
    endings: [{ stepId: crypto.randomUUID(), outcome: 'found', label: 'Found',
                example: { loanNumber: 'ML-26-04471' } }],
    answers: [{ noteId: crypto.randomUUID() }],
    attested: true,
  });
  assert.equal(given.success, true);
  assert.equal(given.success === true && given.data.endings[0]!.example['loanNumber'], 'ML-26-04471',
    'the example the process owner supplied is what the tests before activation run with');
});
