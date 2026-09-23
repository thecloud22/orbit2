/**
 * The screen parser against screens a real host sent (Orbit 2.3): TK5, which
 * is MVS 3.8j with VTAM and TSO, on Hercules. Each fixture is `ReadBuffer`
 * as s3270 gave it, with where the host left the cursor. What they hold is
 * what the twin never did: a first screen with no key legend, prompts written
 * into unprotected fields, a pause, a title on row 0, a bare "===>".
 */
import { strict as assert } from 'node:assert';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { answerOf, locate, parseBuffer, seenOf, type Screen, type TerminalBinding } from './screen.ts';

const screen = (name: string): Screen => {
  const { rows, cursor } = JSON.parse(readFileSync(join(import.meta.dirname, 'fixtures', `${name}.json`), 'utf8'));
  return parseBuffer(rows, cursor);
};
const fields = (s: Screen) => seenOf(s).filter((x) => x.what === 'field').map((x) => x.name);
const keys = (s: Screen) => seenOf(s).filter((x) => x.what === 'button').map((x) => x.name);

test('VTAM\'s logon screen: named by its field, and Enter offered though no legend says so', () => {
  const s = screen('tk5-vtam-logon');
  assert.equal(s.lineMode, false);
  assert.equal(s.identity, 'Logon', 'not the clock beside it');
  assert.deepEqual(fields(s), ['Logon']);
  assert.deepEqual(keys(s), ['ENTER']);
});

test('TSO\'s password prompt: the live field is the one with the cursor, named by the prompt, and secret', () => {
  const s = screen('tk5-tso-password');
  assert.equal(s.lineMode, true);
  assert.equal(s.identity, 'ENTER CURRENT PASSWORD FOR HERC02');
  const [field] = seenOf(s).filter((x) => x.what === 'field');
  assert.equal(field?.name, 'ENTER CURRENT PASSWORD FOR HERC02');
  assert.equal(field?.secret, true);
  assert.deepEqual(keys(s), ['ENTER']);
});

test('a prompt written further down is the same prompt: found by what it asks, not where', () => {
  const s = screen('tk5-tso-password');
  const b: TerminalBinding = { connector: 'tn3270', screen: s.identity, what: 'field',
    label: 'ENTER CURRENT PASSWORD FOR HERC02', row: 6, column: 1, length: 79 };
  const found = locate(s, b);
  assert.equal(found.found, 'one');
  if (found.found === 'one') assert.deepEqual([found.field.row, found.field.column], [1, 1], 'where the host is, not where it was mapped');
});

test('TSO\'s "***" is a pause: nothing to type, only Enter', () => {
  const s = screen('tk5-tso-pause');
  assert.equal(s.identity, '***');
  assert.deepEqual(fields(s), []);
  assert.deepEqual(keys(s), ['ENTER']);
  assert.ok(seenOf(s).some((x) => x.what === 'value' && /Welcome to the TSO system/.test(x.name)), 'what TSO wrote is there to read');
});

test('READY: the command goes into the field the cursor is in, after the last READY', () => {
  const s = screen('tk5-tso-ready');
  assert.equal(s.lineMode, true);
  assert.equal(s.identity, 'READY');
  assert.deepEqual(fields(s), ['READY']);
});

test('ISPF: the title on row 0 names the screen, not a choice on a menu row or ": HERC02"', () => {
  const s = screen('tk5-ispf-menu');
  assert.equal(s.lineMode, false);
  assert.equal(s.identity, 'ISPF primary option menu');
  assert.deepEqual(fields(s), ['Option']);
});

test('a bare "===>" is named by what is written over it, and a ruled title by its words', () => {
  const s = screen('tk5-tso-command');
  assert.equal(s.identity, 'TSO COMMAND PROCESSOR');
  assert.equal(fields(s)[0], 'ENTER TSO COMMAND, CLIST, OR REXX EXEC BELOW');
});

test('dot leaders are a label, as on CUA panels', () => {
  // "Loan number . . ." then an input, built as the host would send it.
  const hex = (t: string) => [...t].map((c) => c.charCodeAt(0).toString(16)).join(' ');
  const row = `SF(c0=e0) ${hex('Loan number . . .')} SF(c0=c0) ${hex('            ')} SF(c0=e0) ${hex(' '.repeat(80 - 31))}`;
  const s = parseBuffer([row, `SF(c0=e0) ${hex(' '.repeat(79))}`], { row: 0, column: 18 });
  assert.deepEqual(fields(s), ['Loan number']);
});

// Orbit 2.4: whether the host did what a record-changing key asked, from its
// own words. LSV20 under KICKS, before PF5, after it, and after it again.

test('an approval the host accepted: the message it wrote, which says it was done', () => {
  const answer = answerOf(screen('tk5-lsv20-detail'), screen('tk5-lsv20-approved'));
  assert.deepEqual(answer, { accepted: true, said: 'LSV205I LOAN APPROVED' });
});

test('an approval the host refused: an E message, though the screen is otherwise the same', () => {
  const answer = answerOf(screen('tk5-lsv20-approved'), screen('tk5-lsv20-refused'));
  assert.deepEqual(answer, { accepted: false, why: 'refused', said: 'LSV206E LOAN ALREADY APPROVED' });
});

test('refused again, with the screen unchanged: still the refusal, in its words', () => {
  const answer = answerOf(screen('tk5-lsv20-refused'), screen('tk5-lsv20-refused'));
  assert.deepEqual(answer, { accepted: false, why: 'refused', said: 'LSV206E LOAN ALREADY APPROVED' });
});

test('a key the host answered and did nothing with: unchanged, and a message left from before is not an answer', () => {
  assert.deepEqual(answerOf(screen('tk5-lsv20-detail'), screen('tk5-lsv20-detail')), { accepted: false, why: 'unchanged' });
  assert.deepEqual(answerOf(screen('tk5-lsv20-approved'), screen('tk5-lsv20-approved')), { accepted: false, why: 'unchanged' });
});

test('a screen that moved on with no message is accepted; a screen code and a loan number are not messages', () => {
  // VTAM's logon screen to LSV20: another screen, and nothing on it reads as
  // a message — not LSV20, not ML-26-04502, not "MVS 3.8j Level 8505".
  assert.deepEqual(answerOf(screen('tk5-vtam-logon'), screen('tk5-lsv20-detail')), { accepted: true });
});
