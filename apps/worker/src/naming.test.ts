/**
 * What the page is called comes from Playwright, not from Orbit.
 *
 * Orbit used to compute accessible names itself, in the page, with a chain of
 * fallbacks that approximated the algorithm. It had no support for
 * aria-labelledby, ordered title before placeholder where the specification is
 * the other way round, and skipped any control holding more than one child
 * element — which is what a button with an icon and a label is.
 *
 * The three below are that, exactly: on this page Orbit found none of them and
 * Playwright found all three. They are the cases a demonstration reported as
 * "something was pressed and Orbit could not name it".
 *
 * The point is not that these three now work. It is that one implementation
 * answers both questions. Every binding is resolved with getByRole, so a name
 * computed anywhere else is a second implementation that has to agree with
 * Playwright's and cannot be made to.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { chromium, type Browser, type Page } from 'playwright';
import { snapshot } from './snapshot.ts';

const PAGE = `<!doctype html><body>
  <span id="lbl">Loan number</span>
  <input aria-labelledby="lbl">
  <div role="button" tabindex="0">Approve file</div>
  <button><svg width="8" height="8"></svg><span>Decline file</span></button>
  <div><p>Credit score</p><p>762</p></div>
</body>`;

let browser: Browser;
let page: Page;

before(async () => {
  browser = await chromium.launch();
  page = await browser.newPage();
  await page.setContent(PAGE);
});
after(async () => { await browser?.close(); });

test('a control named through aria-labelledby is found, and named by its label', async () => {
  const seen = await snapshot(page);
  const field = seen.find((s) => s.role === 'textbox');
  assert.ok(field, 'the field was not collected at all');
  assert.equal(field.name, 'Loan number');
});

test('a button built out of a div is a button, not a textbox', async () => {
  const seen = await snapshot(page);
  const approve = seen.find((s) => s.name === 'Approve file');
  assert.ok(approve, 'a div with role=button was not collected');
  // It used to be collected — when it was collected at all — as a textbox,
  // because the role came from the tag. The binding then named a role the
  // page does not have, which resolves to nothing, after publication.
  assert.equal(approve.role, 'button');
});

test('a button holding an icon and a label is still one button', async () => {
  const seen = await snapshot(page);
  const decline = seen.find((s) => s.name === 'Decline file');
  assert.ok(decline, 'a button with two children was dropped');
  assert.equal(decline.role, 'button');
});

test('every name Orbit reports is one getByRole can find again', async () => {
  // The property the whole change is for. A name that cannot be looked up is
  // a step that resolves to nothing at run time, after publication, which is
  // the worst moment to discover it.
  const seen = await snapshot(page);
  const controls = seen.filter((s) => s.what === 'button' || s.what === 'field' || s.what === 'link');
  assert.ok(controls.length >= 3, `expected the three controls, saw ${controls.length}`);

  for (const control of controls) {
    const found = await page.getByRole(control.role as 'button', { name: control.name, exact: true }).count();
    assert.equal(found, 1, `getByRole('${control.role}', { name: '${control.name}' }) found ${found}`);
  }
});

test('values are still read from the page, which the accessibility tree does not offer', async () => {
  // Playwright answers "what is this control called". It does not answer
  // "what figure is this, and what labels it" — a paragraph beside another
  // paragraph is not an accessibility object. That pairing stays Orbit's, and
  // removing it would leave nothing for a read step to name.
  //
  // The pair is wrapped because a label and its value count as a pair only
  // when they are the whole of what their parent says. Written flat in the
  // body they share it with the controls above, and are correctly not a pair
  // — which is this test getting the rule wrong, not the rule.
  const seen = await snapshot(page);
  const score = seen.find((s) => s.name === '762');
  assert.ok(score, 'a labelled figure was lost');
  assert.equal(score.labelledBy, 'Credit score');
});
