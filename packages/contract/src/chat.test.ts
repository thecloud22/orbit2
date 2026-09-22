/**
 * The chat's guard rails are code, so they are tested as code. What matters
 * most is what gets through: a secret that is sent, an address that is
 * reached, a data change added as a step.
 */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { addressesIn, asksToChangeData, looksLikeSecret, outsideAddresses } from './chat.ts';

test('a message that reads like a secret is caught', () => {
  for (const s of [
    "Here's the login: jsmith / hunter2", 'the password is hunter2', 'pwd=abc123',
    'my card 4111 1111 1111 1111', 'use sk-live_abcdefghijklmnop1234', 'AKIAIOSFODNN7EXAMPLE',
  ]) assert.equal(looksLikeSecret(s), true, s);
  for (const s of [
    'Sentence 12 is for a person', 'Raise the threshold to 15,000', 'Use CL-3310 for team lead review',
    'the loan number ML-26-04471', 'claims over $10,000.00 older than 90 days', 'reset your password in Admin',
  ]) assert.equal(looksLikeSecret(s), false, s);
});

test('addresses are found, and only those outside the application are refused', () => {
  assert.deepEqual(addressesIn('Look it up on https://www.amazon.com/s?k=windscreen or ebay.co.uk'),
    ['www.amazon.com', 'ebay.co.uk']);
  assert.deepEqual(outsideAddresses('Check amazon.com for the price', ['localhost:4101']), ['amazon.com']);
  assert.deepEqual(outsideAddresses('Open https://claims.corp.example.com/find', ['corp.example.com']), []);
  assert.deepEqual(outsideAddresses('Find the cheapest windscreen on Amazon', ['localhost:4101']), [],
    'a name is not an address; the model is the one that refuses this');
});

test('a request that changes data is caught, a prohibition is not', () => {
  for (const s of ['Update the enquiry log when done', 'Then approve the file', 'Send the requester an email',
    'Delete the duplicate claim']) assert.equal(asksToChangeData(s), true, s);
  for (const s of ['After reading the claim, check payment history', 'Never change the claim record',
    'Do not update anything', 'Sentence 12 is for a person', 'Read the claim age']) assert.equal(asksToChangeData(s), false, s);
});
