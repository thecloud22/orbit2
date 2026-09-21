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
import { describe, test } from 'node:test';
import { chromium } from 'playwright';
import { couldMean, forTest, mismatchOf, settleAfterActivating } from './author.ts';

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

// ── what the walk types ──────────────────────────────────────────────────
// It used to be the author's example values, looked up by whatever the model
// called the value. Three of the four things a step can carry are not in that
// map and never could be, so all three typed an empty string — and a walk that
// types nothing into a required field never gets off the login page.

const registry = { inputs: { loanNumber: 'ML-26-04471' }, signsInAs: 'admin', signsInWith: 'hunter2' };

test('a password is typed from the registry, not from an example that cannot exist', () => {
  assert.equal(forTest.toType({ from: 'secret', credential: 'app_x' }, registry), 'hunter2');
});

test('the registered account is typed from the registry', () => {
  assert.equal(forTest.toType({ from: 'account' }, registry), 'admin');
});

test('a literal the procedure named is typed, not looked up as if it were a name', () => {
  // "open the file ML-26-04502" was looked up as inputs["ML-26-04502"], so the
  // loan number was never typed and the walk never reached the file.
  assert.equal(
    forTest.toType({ from: 'literal', literal: { type: 'text', text: 'ML-26-04502' } }, registry),
    'ML-26-04502');
});

test('every kind of literal is typed, not only text', () => {
  assert.equal(forTest.toType({ from: 'literal', literal: { type: 'number', number: 417000 } }, registry), '417000');
  assert.equal(forTest.toType({ from: 'literal', literal: { type: 'date', date: '2026-09-20' } }, registry), '2026-09-20');
  assert.equal(forTest.toType({ from: 'literal', literal: { type: 'yesNo', yesNo: true } }, registry), 'yes');
});

test('an input still comes from the example the author gave', () => {
  assert.equal(forTest.toType({ from: 'input', value: 'loanNumber' }, registry), 'ML-26-04471');
  assert.equal(forTest.toType({ from: 'input', value: 'nobodyGaveThis' }, registry), '');
});

test('nothing registered types nothing, rather than the string "undefined"', () => {
  const bare = { inputs: {} };
  assert.equal(forTest.toType({ from: 'secret', credential: 'app_x' }, bare), '');
  assert.equal(forTest.toType({ from: 'account' }, bare), '');
});

// ── the page the next turn meets ─────────────────────────────────────────

const origin = 'http://localhost:4101';
const up = await fetch(`${origin}/login`).then((r) => r.ok).catch(() => false);

describe('after a click, the walk is on the page the click led to',
  { skip: !up && 'portal not running on 4101' }, () => {

  test('a sign-in that navigates by assigning location leaves the login page behind', async () => {
    // This is the page that exposed it. Its submit handler assigns
    // `window.location.href`, so the navigation begins *after* the click
    // resolves — and waiting on the load state of the document being left
    // returned at once. The next turn then mapped against /login, read the
    // brand block, and called it "the pipeline has loaded".
    const browser = await chromium.launch();
    const page = await browser.newPage();
    try {
      await page.goto(`${origin}/login`, { waitUntil: 'domcontentloaded' });
      const wasAt = page.url();
      await page.getByLabel('User ID').fill('admin');
      await page.getByLabel('Password').fill('anything');
      await page.getByRole('button', { name: 'Sign in', exact: true }).first().click().catch(() => undefined);

      await settleAfterActivating(page, wasAt);

      assert.notEqual(page.url(), wasAt, 'the walk has left the page it acted on');
      assert.match(page.url(), /\/pipeline$/);
    } finally {
      await browser.close();
    }
  });

  test('a click that does not navigate returns rather than hanging', async () => {
    // The other half: nothing distinguishes a navigating click from a
    // redrawing one in advance, so the wait has a ceiling. It must end.
    const browser = await chromium.launch();
    const page = await browser.newPage();
    try {
      await page.goto(`${origin}/pipeline`, { waitUntil: 'domcontentloaded' });
      const wasAt = page.url();
      const started = Date.now();
      await settleAfterActivating(page, wasAt);
      const took = Date.now() - started;
      assert.ok(took < 4000, `waited ${took}ms; the ceiling has to hold`);
      assert.equal(page.url(), wasAt);
    } finally {
      await browser.close();
    }
  });
});
