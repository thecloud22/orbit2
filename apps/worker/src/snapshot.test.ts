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

// ── what counts as a label and its value ─────────────────────────────────

import { chromium } from 'playwright';
import { snapshot } from './snapshot.ts';

const on = async (html: string) => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setContent(`<!doctype html><body>${html}</body>`);
  const seen = await snapshot(page);
  await browser.close();
  return seen.filter((s) => s.what === 'value' && s.labelledBy);
};

test('a label and its value are paired when they are the whole of their parent', async () => {
  const pairs = await on('<div><div>Loan-to-value</div><div>64.04%</div></div>');
  assert.equal(pairs.length, 1);
  assert.equal(pairs[0]!.labelledBy, 'Loan-to-value');
  assert.equal(pairs[0]!.name, '64.04%');
});

test('two names inside a sentence are not a label and its value', async () => {
  // The loan file's subtitle. The co-borrower was paired with the borrower as
  // its label, so "read the borrower name" bound to "Adaeze Nwachukwu" and
  // returned Chidi — the wrong person, under a step summary naming the right
  // one. Nothing on the page labels a borrower, so the honest answer is that
  // the page offers none and the procedure gets a question.
  const pairs = await on(
    '<p><span>Adaeze Nwachukwu</span> &amp; <span>Chidi Nwachukwu</span> &middot; 12 Iris Way, Salem OR</p>');
  assert.deepEqual(pairs.map((p) => [p.labelledBy, p.name]), []);
});

test('a pair is still found when the parent only holds whitespace between them', async () => {
  const pairs = await on('<div>\n  <div>Credit score</div>\n  <div>771</div>\n</div>');
  assert.deepEqual(pairs.map((p) => [p.labelledBy, p.name]), [['Credit score', '771']]);
});

test('a labelled value may be longer than its label', async () => {
  // "INCOME ANALYST NOTE" over the analyst's actual note. The ceiling was 60
  // characters on both the label and the value, so the note was dropped for
  // being long — and a procedure asking Orbit to read it had nothing to name.
  // The model bound the read to the nearest heading instead, which the publish
  // gate refuses as circular, so the procedure could not be authored at all.
  const note = 'Borrower is sole member of Whitfield Grounds & Landscape LLC, operating 3 years. '
    + 'Income is materially seasonal and the analyst flagged the swing as unresolved.';
  const pairs = await on(`<div><div>Income analyst note</div><div>${note}</div></div>`);
  assert.equal(pairs.length, 1);
  assert.equal(pairs[0]!.labelledBy, 'Income analyst note');
  assert.equal(pairs[0]!.name, note);
});

test('a label longer than a label is still not one', async () => {
  const long = 'x'.repeat(61);
  assert.deepEqual(await on(`<div><div>${long}</div><div>7</div></div>`), []);
});
