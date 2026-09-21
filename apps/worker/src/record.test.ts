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
import { record, stepFor, WATCH, type Touched } from './record.ts';
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
  const step = stepFor({ kind: 'change', value: null, sensitive: true }, field, { credentialName: 'UNDERWRITING_PW' });
  assert.equal(step?.kind, 'enter');
  assert.equal(step.sensitive, true);
  // A secret is referred to by name. There is nowhere in the step for a value,
  // because the reference kind carries a credential name and nothing else.
  assert.equal(step.value.from, 'secret');
  assert.equal(step.value.from === 'secret' && step.value.credential, 'UNDERWRITING_PW',
    'the credential the application registered, not one invented here');
  assert.equal(JSON.stringify(step).includes('hunter2'), false);
});

test('a password with no registered credential makes no step at all', () => {
  // It used to name `portalPassword` whatever the application was — a
  // credential nobody registered, so the reference parsed and pointed at
  // nothing. A secret Orbit cannot find at run time is worse than a refusal
  // while somebody is still standing in front of the page.
  const field: Seen = {
    index: 1, what: 'field', role: 'textbox', name: 'Password',
    binding: { strategy: 'formName', name: 'passwd' },
  };
  assert.equal(stepFor({ kind: 'change', value: null, sensitive: true }, field, null), null);
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

test('a demonstration against the real application becomes steps', async () => {
  // The one thing a recorder is hard to check is whether it actually captures,
  // and it cannot be checked while the recorder owns the only reference to the
  // window. So the page is handed in, and this test drives it the way a person
  // would: type a loan number, press the button, read what came back.
  const watched = await chromium.launch();
  const page = await watched.newPage();

  let stop: () => void = () => undefined;
  const until = new Promise<void>((resolve) => { stop = resolve; });

  const recording = record({
    origin: 'http://localhost:4101',
    startPath: '/pipeline',
    until,
    open: async () => ({ page, close: async () => undefined }),
  });

  // Give the recorder a moment to arm its listeners on the loaded page.
  await page.waitForTimeout(1200);
  await page.getByRole('textbox').first().fill('ML-26-04502');
  await page.waitForTimeout(400);
  await page.getByRole('button', { name: 'Open file' }).first().click();
  await page.waitForTimeout(1200);

  stop();
  const result = await recording;
  await watched.close();

  assert.ok(result.touched >= 2, `both actions watched: ${result.touched}`);
  const kinds = result.steps.map((s) => s.kind);
  assert.equal(kinds[0], 'open', 'the recording starts where the person started');
  assert.ok(kinds.includes('enter'), `the value typed in became a step: ${kinds.join(', ')}`);
  assert.ok(kinds.includes('activate'), `the button pressed became a step: ${kinds.join(', ')}`);

  // One recording is one path, and it cannot know what the ending is called.
  assert.equal(result.steps.at(-1)?.kind, 'end');
  // Raised as a risk, not a question: there is no sentence a person can type
  // that makes a second path exist.
  const caution = result.questions.find((q) => /one way the procedure can end/.test(q.body));
  assert.ok(caution, 'it says so rather than implying the other paths do not exist');
  assert.equal(caution!.kind, 'risk');
});

// ── the account is the other half of the sign-in ─────────────────────────

const userId: Seen = {
  index: 1, what: 'field', role: 'textbox', name: 'User ID',
  binding: { strategy: 'roleAndName', role: 'textbox', name: 'User ID' },
};

test('typing the registered account refers to it, rather than declaring an input', () => {
  // The recorder declared `userId` as a value supplied at the start of every
  // run, so the confirmation screen asked the author for an example user id —
  // which put the service account's name in the workflow's example and in
  // every run's inputs, and let whoever started a run sign in as somebody
  // else.
  const step = stepFor({ kind: 'change', value: 'admin', sensitive: false }, userId,
    { credentialName: 'app_x', signsInAs: 'admin' });
  assert.equal(step?.kind, 'enter');
  assert.equal(step.value.from, 'account');
  assert.equal(JSON.stringify(step).includes('admin'), false,
    'the account is referred to, not copied into the step');
});

test('a field given anything else is still a value the run supplies', () => {
  const step = stepFor({ kind: 'change', value: 'ML-26-04502', sensitive: false }, userId,
    { credentialName: 'app_x', signsInAs: 'admin' });
  assert.equal(step?.kind, 'enter');
  assert.equal(step.value.from, 'input');
});

test('with no account registered, a typed value stays an input', () => {
  const step = stepFor({ kind: 'change', value: 'admin', sensitive: false }, userId, { signsInAs: null });
  assert.equal(step?.kind, 'enter');
  assert.equal(step.value.from, 'input');
});
