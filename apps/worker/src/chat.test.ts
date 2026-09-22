/**
 * The chat's §12 acceptance cases, against Orbit's checks on a model's answer.
 * The model only says which kind of edit a message asks for; these are the
 * rules that decide what actually happens, and none depends on the model
 * behaving.
 */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { check, type ChatAnswer } from './chat.ts';

const numbers = ['1.1', '1.2', '1.3'];
const hosts = ['localhost:4101'];
const said = (over: Partial<ChatAnswer>): ChatAnswer =>
  ({ kind: 'addSteps', sentence: null, label: null, departs: false, refusal: null, reply: '', ...over });

test('"Find the cheapest windscreen on Amazon" is refused', () => {
  assert.deepEqual(check('Find the cheapest windscreen on Amazon', said({ kind: 'refuse', refusal: 'otherApplication' }), numbers, hosts),
    { do: 'refuse', why: 'otherApplication' });
});

test('an address outside the application is refused whatever the model said', () => {
  assert.deepEqual(check('Also look it up on amazon.com', said({ kind: 'addSteps' }), numbers, hosts),
    { do: 'refuse', why: 'otherApplication' });
});

test('"Update the enquiry log when done" adds nothing that changes data, and offers a hand-off', () => {
  assert.deepEqual(check('Update the enquiry log when done', said({ kind: 'addSteps' }), numbers, hosts),
    { do: 'offerForAPerson' });
});

test('"Raise the threshold to 15,000" is added and marked as departing from the procedure', () => {
  assert.deepEqual(check('The team lead threshold is 15,000, not 10,000.', said({ kind: 'addSteps', departs: true }), numbers, hosts),
    { do: 'addSteps', departs: true });
});

test('"After reading the claim, check payment history" is added in the author\'s words', () => {
  assert.deepEqual(check('After reading the claim, check payment history.', said({ kind: 'addSteps' }), numbers, hosts),
    { do: 'addSteps', departs: false });
});

test('a relabel names a sentence that exists, or is refused', () => {
  assert.deepEqual(check('Sentence 2 is for a person', said({ kind: 'relabel', sentence: '1.2', label: 'forAPerson' }), numbers, hosts),
    { do: 'relabel', sentence: '1.2', label: 'forAPerson' });
  assert.deepEqual(check('Sentence 9 is for a person', said({ kind: 'relabel', sentence: '1.9', label: 'forAPerson' }), numbers, hosts),
    { do: 'refuse', why: 'cannotDoThat' });
});

test('publishing, running and anything unlisted cannot be done from the chat', () => {
  assert.deepEqual(check('Publish it', said({ kind: 'refuse', refusal: 'cannotDoThat' }), numbers, hosts),
    { do: 'refuse', why: 'cannotDoThat' });
  assert.deepEqual(check('whatever', null, numbers, hosts), { do: 'refuse', why: 'cannotDoThat' },
    'an answer that could not be read changes nothing');
});
