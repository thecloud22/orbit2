/**
 * The loan-servicing twin's screens, as a state machine: no network, no
 * emulator. Run with `npx tsx --test src/servicing.test.ts`.
 */
import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { AID } from './datastream';
import { LOAN_SERVICING, accountFor, type ServicingState } from './servicing';
import { LOANS } from './servicing-data';
import { LOANS as PORTAL, loanToValue, debtToIncome } from '../../mortgage-portal/src/data/loans';

const none = new Map<string, string>();
const typed = (entries: Record<string, string>) => new Map(Object.entries(entries));
const text = (s: ServicingState) => LOAN_SERVICING.render(s).elements
  .map((e) => ('text' in e ? e.text : '')).join('\n');

function signedIn(): ServicingState {
  return LOAN_SERVICING.advance(LOAN_SERVICING.start(), AID.enter, typed({ userId: 'admin', password: 'x' }));
}
function opened(loan: string): ServicingState {
  return LOAN_SERVICING.advance(signedIn(), AID.enter, typed({ loanNumber: loan }));
}

test('the twin serves the web portal\'s nine files, with its figures', () => {
  assert.equal(LOANS.length, PORTAL.length);
  for (const p of PORTAL) {
    const l = LOANS.find((x) => x.loanNumber === p.loanNumber)!;
    assert.ok(l, p.loanNumber);
    assert.equal(l.borrower, p.borrowerName);
    assert.equal(l.amount, p.loanAmount);
    assert.equal(l.noteRate, p.noteRate);
    assert.equal(l.ltv, loanToValue(p));
    assert.equal(l.dti, debtToIncome(p));
    assert.equal(l.fico, p.creditScore);
    assert.equal(l.reserves, p.reserveMonths);
    assert.equal(l.flood, p.floodZone);
  }
});

test('sign on needs both fields, then opens on the inquiry screen', () => {
  const refused = LOAN_SERVICING.advance(LOAN_SERVICING.start(), AID.enter, typed({ userId: 'admin' }));
  assert.equal(refused.screen, 'signon');
  assert.match(text(refused), /LSV012E/);
  assert.equal(signedIn().screen, 'inquiry');
  assert.equal(signedIn().user, 'ADMIN');
});

test('an inquiry opens the loan, and a number that matches nothing says so', () => {
  const s = opened('ml-26-04561');
  assert.equal(s.screen, 'detail');
  assert.match(text(s), /85\.00/);
  const missing = opened('ML-26-99999');
  assert.equal(missing.screen, 'inquiry');
  assert.match(text(missing), /LSV102E NO LOAN MATCHES THAT NUMBER/);
});

test('a condition is one key, a decision is one key, and a decided loan takes neither again', () => {
  let s = opened('ML-26-04561');
  s = LOAN_SERVICING.advance(s, AID.pf7, none);
  assert.match(text(s), /LSV207I PMI CONDITION ATTACHED/);
  assert.match(text(s), /CONDITIONS ON FILE[\s\S]*PMI/);
  s = LOAN_SERVICING.advance(s, AID.pf5, none);
  assert.match(text(s), /LSV205I LOAN APPROVED/);
  assert.match(text(s), /APPROVED/);
  s = LOAN_SERVICING.advance(s, AID.pf6, none);
  assert.match(text(s), /LSV206E LOAN ALREADY APPROVED/);
});

test('boarding checks what is typed, and a boarded loan gets its account', () => {
  let s = LOAN_SERVICING.advance(signedIn(), AID.pf4, none);
  assert.equal(s.screen, 'board');
  const form = { loanNumber: 'ML-26-04471', borrower: 'DANA OKONKWO', amount: '$360,000', noteRate: '6.375', program: 'Conventional' };
  s = LOAN_SERVICING.advance(s, AID.pf10, typed(form));
  assert.match(text(s), /LSV404E PROGRAM MUST BE CONV FHA VA OR JUMB/);
  s = LOAN_SERVICING.advance(s, AID.pf10, typed({ ...form, program: 'CONV', noteRate: '12.5' }));
  assert.match(text(s), /LSV407E NOTE RATE OUTSIDE PROGRAM RANGE/);
  s = LOAN_SERVICING.advance(s, AID.pf10, typed({ ...form, program: 'CONV' }));
  assert.match(text(s), new RegExp(`LSV405I LOAN BOARDED. SERVICING ACCOUNT ${accountFor('ML-26-04471')}`));
  assert.equal(accountFor('ML-26-04471'), '7704471');
  s = LOAN_SERVICING.advance(s, AID.pf10, typed({ ...form, program: 'CONV' }));
  assert.match(text(s), /LSV406E LOAN ALREADY BOARDED - ACCOUNT 7704471/);
});

test('a borrower\'s existing loans, with the worst days past due', () => {
  let s = LOAN_SERVICING.advance(signedIn(), AID.pf6, none);
  s = LOAN_SERVICING.advance(s, AID.enter, typed({ borrower: 'Priya Raghunathan' }));
  assert.match(text(s), /WORST DAYS PAST DUE[\s\S]*45/);
  const clear = LOAN_SERVICING.advance(LOAN_SERVICING.advance(signedIn(), AID.pf6, none), AID.enter, typed({ borrower: 'Dana Okonkwo' }));
  assert.match(text(clear), /LSV502I NO EXISTING LOANS WITH US/);
});
