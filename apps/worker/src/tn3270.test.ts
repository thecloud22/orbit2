/**
 * The green-screen connector against the loan-servicing twin, over real
 * TN3270 through s3270 (Orbit 2.2, C5–C10). Skipped where s3270 is not
 * installed, which is the connector saying so rather than a test failing.
 */
import { strict as assert } from 'node:assert';
import { spawn, type ChildProcess } from 'node:child_process';
import { after, before, test } from 'node:test';
import { join } from 'node:path';
import { lookAtGreenScreen } from './looking-tn3270.ts';
import { openGreenScreen } from './surface-tn3270.ts';
import { s3270Ready } from './tn3270/s3270.ts';
import type { TerminalBinding } from './tn3270/screen.ts';

const ready = s3270Ready().ready;
const PORT = 3290 + Math.floor(Math.random() * 60);
const origin = `tn3270://127.0.0.1:${PORT}`;
let twin: ChildProcess | null = null;

before(async () => {
  if (!ready) return;
  const root = join(import.meta.dirname, '../../../demo/terminal-portal');
  twin = spawn(join(root, 'node_modules/.bin/tsx'), ['src/servicing-main.ts'],
    { cwd: root, env: { ...process.env, ORBIT_SERVICING_PORT: String(PORT) }, stdio: ['ignore', 'ignore', 'pipe'] });
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('the twin did not start')), 20_000);
    twin!.stderr!.on('data', (b: Buffer) => { if (String(b).includes('listening')) { clearTimeout(timer); resolve(); } });
  });
});
after(() => { twin?.kill(); });

test('the walk sees the sign-on screen as fields, a secret and keys', { skip: !ready }, async () => {
  const looking = await lookAtGreenScreen(origin);
  try {
    await looking.open('/');
    assert.match(looking.place(), /LSV01$/);
    const seen = await looking.look();
    const user = seen.find((s) => s.what === 'field' && s.name === 'USERID');
    const pass = seen.find((s) => s.what === 'field' && s.name === 'PASSWORD');
    const signOn = seen.find((s) => s.what === 'button' && s.name === 'SIGN ON');
    assert.ok(user && pass && signOn, JSON.stringify(seen.map((s) => `${s.what}:${s.name}`)));
    assert.equal(pass.secret, true);
    assert.equal((signOn.binding as unknown as TerminalBinding).key, 'ENTER');

    await looking.type(user, 'admin');
    await looking.type(pass, 'hunter2');
    const picture = await looking.picture();
    assert.equal(picture?.mediaType, 'image/svg+xml');
    assert.ok(!String(picture?.bytes).includes('hunter2'), 'a password never reaches a picture');
    assert.ok(!(await looking.visibleText()).includes('hunter2'), 'nor the screen text');

    await looking.press(signOn);
    assert.match(looking.place(), /LSV01$/, 'place is as of the last look');
    const inquiry = await looking.look();
    assert.match(looking.place(), /LSV10$/);
    const number = inquiry.find((s) => s.what === 'field' && s.name === 'LOAN NUMBER')!;
    await looking.type(number, 'ML-26-04561');
    await looking.press(inquiry.find((s) => s.name === 'INQUIRE')!);
    const detail = await looking.look();
    const ltv = detail.find((s) => s.what === 'value' && s.labelledBy === 'LTV');
    assert.equal(ltv?.name, '85.00');
    // Keys are named by what they do, verb first (Decision 16).
    assert.ok(detail.some((s) => s.what === 'button' && s.name === 'APPROVE'));
    assert.ok(detail.some((s) => s.what === 'button' && s.name === 'ATTACH PMI'));
    const box = await looking.boxOf(ltv!);
    assert.ok(box && box.x > 0 && box.w > 0);
  } finally {
    await looking.close();
  }
});

test('a run finds each field again by screen, label and address, and refuses another screen', { skip: !ready }, async () => {
  const surface = await openGreenScreen(origin);
  try {
    await surface.open('/');
    const at = (b: Partial<TerminalBinding>) => ({ connector: 'tn3270', row: 0, column: 0, length: 0, ...b }) as never;
    const user = await surface.find(at({ screen: 'LSV01', what: 'field', label: 'USERID', row: 4, column: 17, length: 8 }));
    assert.equal(user.found, 'one');
    if (user.found === 'one') await user.it.fill('admin');
    const pass = await surface.find(at({ screen: 'LSV01', what: 'field', label: 'PASSWORD', row: 6, column: 17, length: 8 }));
    if (pass.found === 'one') await pass.it.fill('x');
    const moved = await surface.find(at({ screen: 'LSV01', what: 'field', label: 'USERID', row: 5, column: 17, length: 8 }));
    assert.equal(moved.found, 'none', 'an address that disagrees is a refusal, not a guess');
    const signOn = await surface.find(at({ screen: 'LSV01', what: 'key', key: 'ENTER', label: 'SIGN ON' }));
    assert.equal(signOn.found, 'one');
    if (signOn.found === 'one') await signOn.it.activate();

    const stale = await surface.find(at({ screen: 'LSV01', what: 'field', label: 'USERID', row: 4, column: 17, length: 8 }));
    assert.equal(stale.found, 'none');
    assert.equal(stale.found === 'none' ? stale.kind : undefined, 'terminalScreenUnexpected');

    const number = await surface.find(at({ screen: 'LSV10', what: 'field', label: 'LOAN NUMBER', row: 4, column: 20, length: 12 }));
    assert.equal(number.found, 'one');
    if (number.found === 'one') await number.it.fill('ML-26-04561');
    const inquire = await surface.find(at({ screen: 'LSV10', what: 'key', key: 'ENTER', label: 'INQUIRE' }));
    if (inquire.found === 'one') await inquire.it.activate();
    const ltv = await surface.find(at({ screen: 'LSV20', what: 'value', label: 'LTV', row: 8, column: 18, length: 23 }));
    assert.equal(ltv.found, 'one');
    if (ltv.found === 'one') assert.equal(await ltv.it.text(), '85.00');
    const shot = await surface.capture();
    assert.equal(shot.mediaType, 'image/svg+xml');
    assert.match(String(shot.bytes), /AOIFE BRENNAN/);

    // What the host answered each press (Orbit 2.4): approved, then refused
    // in its own words, because this session approved it a moment ago.
    const approve = at({ screen: 'LSV20', what: 'key', key: 'PF5', label: 'APPROVE' });
    const first = await surface.find(approve);
    assert.deepEqual(first.found === 'one' ? await first.it.activate() : null, { accepted: true, said: 'LSV205I LOAN APPROVED' });
    const again = await surface.find(approve);
    assert.deepEqual(again.found === 'one' ? await again.it.activate() : null,
      { accepted: false, why: 'refused', said: 'LSV206E LOAN ALREADY APPROVED' });
  } finally {
    await surface.close();
  }
});

test('a host that is not there is said, as the application being unavailable', { skip: !ready }, async () => {
  const surface = await openGreenScreen('tn3270://127.0.0.1:1');
  await assert.rejects(surface.open('/'), (e: Error & { kind?: string }) => e.kind === 'applicationUnavailable');
  await surface.close();
});
