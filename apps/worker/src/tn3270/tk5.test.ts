/**
 * The green-screen connector against a real host (Orbit 2.3): TK5, which is
 * MVS 3.8j with VTAM and TSO, on Hercules (see demo/mvs). Skipped unless
 * ORBIT_TK5 names it — tn3270://127.0.0.1:3272 — because it is a mainframe
 * in a container and most machines do not run one.
 *
 * It signs on as a run does, by the bindings a published agent would hold,
 * and logs off at the end: TSO holds a dropped user's session for a
 * reconnect, so a test that only disconnected would lock the next one out.
 */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { openGreenScreen } from '../surface-tn3270.ts';
import type { Found, Surface } from '../surface.ts';
import { s3270Ready } from './s3270.ts';
import type { TerminalBinding } from './screen.ts';

const origin = process.env['ORBIT_TK5'];
const user = process.env['ORBIT_TK5_USER'] ?? 'HERC04';
const password = process.env['ORBIT_TK5_PASSWORD'] ?? 'PASS4U';
const skip = !origin ? 'ORBIT_TK5 is not set' : !s3270Ready().ready ? 's3270 is not installed' : false;

const field = (screen: string, label: string, row: number, column: number) =>
  ({ connector: 'tn3270', screen, what: 'field', label, row, column, length: 0 }) as TerminalBinding;
const enter = (screen: string) => ({ connector: 'tn3270', screen, what: 'key', key: 'ENTER', label: 'ENTER', row: 0, column: 0, length: 0 }) as TerminalBinding;

async function one(surface: Surface, b: TerminalBinding) {
  const found = await surface.find(b as never);
  assert.equal(found.found, 'one', found.found === 'none' ? found.why : `found ${found.found}`);
  return (found as { found: 'one'; it: Found }).it;
}

test('signs on to TSO by its bindings, past its pauses, and logs off', { skip }, async () => {
  const surface = await openGreenScreen(origin!);
  let signedOn = false;
  try {
    await surface.open('/');
    await (await one(surface, field('Logon', 'Logon', 22, 11))).fill(`LOGON ${user}`);
    await (await one(surface, enter('Logon'))).activate();

    const asks = `ENTER CURRENT PASSWORD FOR ${user}`;
    await (await one(surface, field(asks, asks, 1, 1))).fill(password);
    await (await one(surface, enter(asks))).activate();
    signedOn = true;

    // The welcome and the fortune each paused on "***"; settling passed them.
    const option = await one(surface, field('ISPF primary option menu', 'Option', 1, 14));
    const shot = await surface.capture();
    assert.match(String(shot.bytes), /ISPF primary option menu/);
    assert.ok(!String(shot.bytes).includes(password), 'a password never reaches a picture');
    await option.fill('X');
    await (await one(surface, enter('ISPF primary option menu'))).activate();
  } finally {
    if (signedOn) await logOff(surface);
    await surface.close();
  }
});

/** From wherever TSO is, to READY, and LOGOFF. */
async function logOff(surface: Surface) {
  for (let i = 0; i < 4; i++) {
    const ready = await surface.find(field('READY', 'READY', 0, 0) as never);
    if (ready.found === 'one') {
      await ready.it.fill('LOGOFF');
      const key = await surface.find(enter('READY') as never);
      if (key.found === 'one') await key.it.activate();
      return;
    }
    const any = await surface.find(enter('') as never);
    if (any.found === 'one') await any.it.activate();
  }
  assert.fail('TSO did not come to READY to be logged off');
}

test('loan servicing on the mainframe: signed on, a loan inquired and read, signed off', { skip }, async () => {
  const clerk = process.env['ORBIT_TK5_CLERK'] ?? 'HERC02';
  const clerkPassword = process.env['ORBIT_TK5_CLERK_PASSWORD'] ?? 'CUL8TR';
  const key = (screen: string, k: string, label: string) =>
    ({ connector: 'tn3270', screen, what: 'key', key: k, label, row: 0, column: 0, length: 0 }) as TerminalBinding;
  const surface = await openGreenScreen(origin!);
  try {
    await surface.open('/');
    await (await one(surface, field('Logon', 'Logon', 22, 11))).fill(clerk);
    await (await one(surface, enter('Logon'))).activate();
    const asks = `ENTER CURRENT PASSWORD FOR ${clerk}`;
    await (await one(surface, field(asks, asks, 1, 1))).fill(clerkPassword);
    await (await one(surface, enter(asks))).activate();

    // TSO's welcome paused on "***" and was passed; KICKS opens on LSV00,
    // whose key only means "continue" (the first key under TSO arrives as PA2).
    await (await one(surface, key('LSV00', 'ENTER', 'CONTINUE'))).activate();
    await (await one(surface, field('LSV10', 'LOAN NUMBER', 4, 19))).fill('ML-26-04561');
    await (await one(surface, key('LSV10', 'ENTER', 'INQUIRE'))).activate();
    const ltv = await one(surface, { connector: 'tn3270', screen: 'LSV20', what: 'value', label: 'LTV', row: 8, column: 17, length: 6 } as TerminalBinding);
    assert.equal(await ltv.text(), '85.00', 'the figure the twin shows, read off a CICS screen');
    await (await one(surface, key('LSV20', 'PF3', 'RETURN'))).activate();
    await (await one(surface, key('LSV10', 'PF3', 'SIGN OFF'))).activate();
    // Signing off the application logs off TSO: VTAM's logon screen again.
    await one(surface, field('Logon', 'Logon', 22, 11));
  } finally {
    await surface.close();
  }
});
