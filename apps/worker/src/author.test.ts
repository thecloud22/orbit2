/**
 * The rule that decides which elements an act was allowed to mean.
 *
 * `author.ts` had no test file at all, which is why this went unnoticed: it is
 * the model-driven mapping, the part of the product most able to change
 * behaviour silently.
 *
 * What is proved here is narrow and exact. Orbit refuses ambiguity rather than
 * breaking a tie (Decision 12), and that refusal is only honest if the things
 * it counts are things the act could have meant. A heading and a button with
 * the same words are not two candidates for a press.
 */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { couldMean, mismatchOf } from './author.ts';

const el = (what: 'field' | 'button' | 'link' | 'value' | 'heading', name: string) => ({ what, name });

// The page that exposed it: /login on the mortgage portal has an <h1> "Sign
// in" above a <button> "Sign in". Every one of the fifty test procedures
// begins by signing in, and every one of them was refused as ambiguous.
const LOGIN_PAGE = [el('heading', 'Sign in'), el('button', 'Sign in')];

test('a heading does not compete with a button for a press', () => {
  const candidates = LOGIN_PAGE.filter((s) => couldMean('activate', s));
  assert.equal(candidates.length, 1, 'one thing on this page can be pressed');
  assert.equal(candidates[0]!.what, 'button');
});

test('two buttons with one name are still a refusal', () => {
  // Decision 12 stands. The ambiguous-decision fixture puts two real buttons
  // called "Approve" on one page precisely to be refused.
  const both = [el('button', 'Approve'), el('button', 'Approve')];
  assert.equal(both.filter((s) => couldMean('activate', s)).length, 2);
});

test('an act may only mean what it can act on', () => {
  assert.equal(couldMean('enter', el('field', 'User ID')), true);
  assert.equal(couldMean('enter', el('button', 'Sign in')), false);
  assert.equal(couldMean('activate', el('link', 'Features')), true);
  assert.equal(couldMean('activate', el('heading', 'Sign in')), false);
  assert.equal(couldMean('read', el('value', 'Credit score')), true);
  assert.equal(couldMean('read', el('field', 'User ID')), false);
});

test('the refusal names the thing that is there, not an absence', () => {
  // "not on the page" would send an author looking for a control that is
  // sitting right in front of them.
  assert.match(mismatchOf('activate', el('heading', 'Sign in')), /heading "Sign in".*cannot be pressed|not something that can be pressed/);
  assert.match(mismatchOf('enter', el('button', 'Sign in')), /not something a value goes into/);
  assert.match(mismatchOf('read', el('field', 'User ID')), /not a value to read/);
});
