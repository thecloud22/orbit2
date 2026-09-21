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
    answers: [{ noteId: crypto.randomUUID(), answer: 'Call it "note rate recorded".' }],
    attested: true,
  });
  assert.equal(given.success, true);
  assert.equal(given.success === true && given.data.endings[0]!.example['loanNumber'], 'ML-26-04471',
    'the example the process owner supplied is what the tests before activation run with');
});

test('a question cannot be closed by citing it — an answer is something somebody said', () => {
  // Criterion 3 says an outstanding question blocks confirmation and the
  // blocker is named. Answering by id satisfied that to the letter and settled
  // nothing: the note went resolved with no record of what was decided. It is
  // how a version came to be published with its conclusion named "unnamed".
  const byId = confirmation.safeParse({
    endings: [], answers: [{ noteId: crypto.randomUUID() }], attested: true });
  assert.equal(byId.success, false);

  const answered = confirmation.safeParse({
    endings: [], answers: [{ noteId: crypto.randomUUID(), answer: 'Call it "note rate recorded".' }],
    attested: true });
  assert.equal(answered.success, true);
});

test('a space bar is not an answer', () => {
  const given = confirmation.safeParse({
    endings: [], answers: [{ noteId: crypto.randomUUID(), answer: '   ' }], attested: true });
  assert.equal(given.success, false, 'trimmed before it is judged');
});

test('an ending needs an example only for what the workflow actually asks for', () => {
  // A procedure that names the record it works on declares no input, so a run
  // of it needs no values. Demanding an example anyway made such a workflow
  // impossible to confirm at all: the screen had nothing to ask for, and the
  // gate refused what it sent.
  const given = confirmation.safeParse({
    endings: [{ stepId: crypto.randomUUID(), outcome: 'loanApproved', label: 'Loan approved', example: {} }],
    answers: [], attested: true,
  });
  assert.equal(given.success, true, 'the shape is fine; whether it is enough is the rule’s business');
});
