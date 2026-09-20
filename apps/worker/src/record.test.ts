/**
 * The one thing a recorder must not do.
 *
 * §2: "A value supplied as a secret at run time is required afresh on every
 * run, is never stored, and never appears in a run's inputs, outputs, logs,
 * events or captured evidence." A recorder watches keystrokes, and a password
 * is a keystroke — so this is the only place in the product where a secret
 * could have been captured by accident, and the only place worth proving it
 * is not.
 */
import { strict as assert } from 'node:assert';
import { after, before, test } from 'node:test';
import { chromium, type Browser, type Page } from 'playwright';
import { stepFor, WATCH, type Touched } from './record.ts';
import type { Seen } from './snapshot.ts';

let browser: Browser;
let page: Page;
const reported: Touched[] = [];

before(async () => {
  browser = await chromium.launch();
  page = await browser.newPage();
  await page.exposeFunction('__orbitTouched', (e: Touched) => { reported.push(e); });
  await page.setContent(`
    <form>
      <label for="u">User</label><input id="u" name="userid">
      <label for="p">Password</label><input id="p" type="password" name="passwd">
      <button type="button">Sign on</button>
    </form>`);
  await page.evaluate(WATCH);
});
after(async () => { await browser?.close(); });

test('an ordinary value is captured', async () => {
  reported.length = 0;
  await page.locator('#u').fill('claims_svc');
  await page.locator('#u').blur();
  const event = reported.at(-1);
  assert.equal(event?.kind, 'change');
  assert.equal(event.sensitive, false);
  assert.equal(event.value, 'claims_svc');
});

test('a password is noticed and its value never leaves the page', async () => {
  reported.length = 0;
  await page.locator('#p').fill('hunter2-the-real-one');
  await page.locator('#p').blur();

  const event = reported.at(-1);
  assert.equal(event?.sensitive, true, 'it must know this one is a secret');
  assert.equal(event.value, null, 'and it must not carry the value');

  // Belt and braces: the string must not be anywhere in what was reported.
  assert.equal(JSON.stringify(reported).includes('hunter2'), false,
    'the value must not appear anywhere in what the recorder was told');
});

test('a captured password becomes a named credential, not a value', () => {
  const field: Seen = {
    index: 1, what: 'field', role: 'textbox', name: 'Password',
    binding: { strategy: 'formName', name: 'passwd' },
  };
  const step = stepFor({ kind: 'change', value: null, sensitive: true }, field);
  assert.equal(step?.kind, 'enter');
  assert.equal(step.sensitive, true);
  // A secret is referred to by name. There is nowhere in the step for a value,
  // because the reference kind carries a credential name and nothing else.
  assert.equal(step.value.from, 'secret');
  assert.equal(JSON.stringify(step).includes('hunter2'), false);
});

test('a click becomes an activate, and does not claim to know if it changes a record', () => {
  const button: Seen = {
    index: 2, what: 'button', role: 'button', name: 'Sign on',
    binding: { strategy: 'roleAndName', role: 'button', name: 'Sign on' },
  };
  const step = stepFor({ kind: 'click', value: null, sensitive: false }, button);
  assert.equal(step?.kind, 'activate');
  // Orbit cannot tell from a click whether pressing it changes a record, so it
  // proposes false and the author confirms — the same arrangement as every
  // other mapping, rather than a guess dressed as a fact.
  assert.equal(step.changesARecord, false);
});
