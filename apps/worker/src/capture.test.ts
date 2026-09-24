/**
 * The pages the demo portals are not.
 *
 * Every portal Orbit is tested against draws its screen with the document and
 * builds its buttons out of <button>. The applications a pilot runs against do
 * neither, and on them Orbit captured nothing: authoring saw an empty page, a
 * run halted with `controlNotFound` on a field a moment from appearing, and the
 * recorder dropped every press of a span, a styled div or a web component
 * without saying so. These are those pages, small.
 */
import { strict as assert } from 'node:assert';
import { createServer, type Server } from 'node:http';
import { after, before, test } from 'node:test';
import { chromium, type Browser } from 'playwright';
import { lookInBrowser } from './looking-browser.ts';
import { record } from './record.ts';
import { snapshot } from './snapshot.ts';
import { openBrowser } from './surface-browser.ts';

/** The form, fetched from a server that takes three seconds to answer. */
const SLOW = `<!doctype html><body><div id="app">Loading…</div>
<script>fetch('/screen').then((r) => r.text()).then((t) => { document.getElementById('app').innerHTML = t; });</script>`;
const SCREEN = '<h1>Claims</h1><label>Claim number <input name="claimNo"></label><button type="button">Search</button>';

/** Buttons the way enterprise applications build them. */
const BUILT = `<!doctype html><body>
<label>Claim number <input id="claim"></label>
<span id="clear" onclick="void 0">Clear</span>
<div id="save" style="cursor: pointer"><span>Save draft</span></div>
<corp-button id="submit" label="Submit claim"></corp-button>
<p id="words">Nothing here is pressable.</p>
<script>
document.getElementById('save').addEventListener('click', () => {});
customElements.define('corp-button', class extends HTMLElement {
  connectedCallback() {
    this.attachShadow({ mode: 'open' }).innerHTML = '<button>' + this.getAttribute('label') + '</button>';
  }
});
</script>`;

let server: Server;
let origin: string;
let browser: Browser;

before(async () => {
  server = createServer((req, res) => {
    res.setHeader('content-type', 'text/html');
    if (req.url === '/screen') setTimeout(() => res.end(SCREEN), 3000);
    else res.end(req.url === '/built' ? BUILT : SLOW);
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  browser = await chromium.launch();
});
after(async () => { await browser?.close(); server?.close(); });

test('authoring looks at a slow page once it has drawn, not while it says Loading', async () => {
  const looking = await lookInBrowser(origin);
  try {
    await looking.open('/slow');
    const seen = await looking.look();
    assert.ok(seen.some((s) => s.what === 'field' && s.name === 'Claim number'),
      `the field the server sent late: ${seen.map((s) => s.name).join(', ') || 'nothing'}`);
    assert.ok(seen.some((s) => s.what === 'button' && s.name === 'Search'));
  } finally { await looking.close(); }
});

test('a run finds a control that appears after the document has arrived', async () => {
  const surface = await openBrowser(origin);
  try {
    await surface.open('/slow');
    const found = await surface.find({ strategy: 'formName', name: 'claimNo' });
    assert.equal(found.found, 'one');
  } finally { await surface.close(); }
});

test('a run still says a control that never appears is not there', async () => {
  const surface = await openBrowser(origin);
  try {
    await surface.open('/built');
    const found = await surface.find({ strategy: 'formName', name: 'noSuchField' });
    assert.equal(found.found, 'none');
  } finally { await surface.close(); }
});

test('a recording of a slow page names what was drawn after it loaded', async () => {
  const page = await browser.newPage();
  let stop: () => void = () => undefined;
  const until = new Promise<void>((r) => { stop = r; });
  const recording = record({ origin, startPath: '/slow', until,
    open: async () => ({ page, close: async () => undefined }) });

  await page.getByRole('button', { name: 'Search' }).waitFor();
  await page.fill('input[name=claimNo]', 'CL-1001');
  await page.getByRole('button', { name: 'Search' }).click();
  await page.waitForTimeout(500);
  stop();
  const result = await recording;
  await page.close();

  const made = result.steps.filter((s) => s.kind === 'enter' || s.kind === 'activate').map((s) => s.summary);
  assert.deepEqual(made, ['A value, into Claim number', 'Search']);
  assert.equal(result.questions.filter((q) => /could not name/.test(q.body)).length, 0);
});

test('the page sees a button inside a web component, and a span with a click handler', async () => {
  const page = await browser.newPage();
  try {
    await page.goto(`${origin}/built`);
    const seen = await snapshot(page);
    const buttons = seen.filter((s) => s.what === 'button').map((s) => s.name);
    assert.ok(buttons.includes('Submit claim'), `inside the shadow root: ${buttons.join(', ')}`);
    assert.ok(buttons.includes('Clear'), `the span: ${buttons.join(', ')}`);
    // Found again by what it says, since it has no role to be found by.
    const clear = seen.find((s) => s.name === 'Clear')!;
    assert.equal(clear.binding.strategy, 'text');
    assert.equal(await page.getByText('Clear', { exact: true }).count(), 1);
  } finally { await page.close(); }
});

test('a recording captures presses of anything the page made pressable, and nothing else', async () => {
  const page = await browser.newPage();
  let stop: () => void = () => undefined;
  const until = new Promise<void>((r) => { stop = r; });
  const recording = record({ origin, startPath: '/built', until,
    open: async () => ({ page, close: async () => undefined }) });

  await page.locator('#claim').waitFor();
  await page.waitForTimeout(300);
  await page.fill('#claim', 'CL-1001');
  await page.locator('#claim').blur();
  await page.click('#clear');
  await page.click('#save span');
  await page.locator('corp-button button').click();
  await page.click('#words');
  await page.waitForTimeout(500);
  stop();
  const result = await recording;
  await page.close();

  const made = result.steps.filter((s) => s.kind === 'enter' || s.kind === 'activate').map((s) => s.summary);
  assert.deepEqual(made, ['A value, into Claim number', 'Clear', 'Save draft', 'Submit claim']);
  assert.equal(result.touched, 4, 'a click on plain words is not a press');
});

// ── corporate sign-in pages, and the record behind them ──────────────────

test('a heading built from a div is a heading, not a field beside the email box', async () => {
  // Microsoft's sign-in page: "field — Sign in" sat above the real email box,
  // and after Next "Enter password" (the heading) beside "Enter the password".
  const page = await browser.newPage();
  try {
    await page.setContent(`<div role="heading" aria-level="1">Sign in</div>
      <input type="email" name="loginfmt" aria-label="Enter your email, phone, or Skype.">
      <div role="region" aria-label="Sign-in options">Options</div>
      <input type="submit" value="Next">`);
    const seen = await snapshot(page);
    const fields = seen.filter((s) => s.what === 'field').map((s) => s.name);
    assert.deepEqual(fields, ['Enter your email, phone, or Skype.']);
    assert.ok(seen.some((s) => s.what === 'heading' && s.name === 'Sign in'));
  } finally { await page.close(); }
});

test('a record laid out as labels and values is read by its labels', async () => {
  // A claim showing Status | Open over Adjuster | R. Okafor. Read as a grid,
  // its first row became column headings and "Status" named three things.
  const page = await browser.newPage();
  try {
    await page.setContent(`<h1>Claim CL-1001</h1><table>
      <tr><td>Status</td><td>Open</td></tr><tr><td>Adjuster</td><td>R. Okafor</td></tr></table>`);
    const seen = await snapshot(page);
    const values = seen.filter((s) => s.what === 'value').map((s) => [s.labelledBy, s.name]);
    assert.deepEqual(values, [['Status', 'Open'], ['Adjuster', 'R. Okafor']]);
  } finally { await page.close(); }
});

test('the WebSEAL login form is two fields and a Submit, and nothing else to read', async () => {
  const page = await browser.newPage();
  try {
    await page.setContent(`<h2>Access Manager for e-business</h2><form method="POST" action="/pkmslogin.form">
      <table><tr><td><b>Username</b></td><td><input type="text" name="username"></td></tr>
      <tr><td><b>Password</b></td><td><input type="password" name="password"></td></tr>
      <tr><td><input type="submit" value="Submit"></td></tr></table></form>`);
    const seen = await snapshot(page);
    assert.deepEqual(seen.filter((s) => s.what !== 'heading').map((s) => `${s.what} ${s.name}`),
      ['field Username', 'field Password', 'button Submit']);
  } finally { await page.close(); }
});
