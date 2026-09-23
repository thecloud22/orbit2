import { AID, type ScreenDefinition, type ScreenElement } from './datastream';
import type { HostedApplication } from './host';
import { EXISTING, LOANS, type ServicedLoan } from './servicing-data';

/**
 * Meridian Home Lending's loan servicing, as a green screen (Orbit 2.2, C16).
 *
 * The mainframe twin of the web portal: the same nine files, the same figures,
 * over TN3270. Six screens — sign on (LSV01), inquiry (LSV10), loan detail
 * (LSV20), boarding a new loan (LSV40) and a borrower's existing loans (LSV50)
 * — and the keys along the bottom that move between them.
 *
 * What a session changes (a decision, a condition, a boarding) lives in that
 * session and nowhere else, like the service desk beside it: every session
 * starts from the seeded files, so a demonstration runs the same every time.
 *
 * A key that changes a record is named by the verb Orbit checks a press
 * against (Decision 16): APPROVE, REFER, ATTACH …, SUBMIT. A condition is
 * attached with one key rather than a selection list, because a rule's action
 * is built from presses (decide.ts).
 */

type Screen = 'signon' | 'inquiry' | 'detail' | 'board' | 'borrower';

export interface ServicingState {
  readonly screen: Screen;
  readonly user: string;
  readonly loan?: string;
  readonly message?: { readonly text: string; readonly error: boolean };
  /** What this session has done: decisions, conditions, boardings. */
  readonly decided: Readonly<Record<string, 'APPROVED' | 'REFERRED TO SENIOR UW'>>;
  readonly conditions: Readonly<Record<string, readonly string[]>>;
  readonly boarded: Readonly<Record<string, string>>;
  /** What was typed on the boarding screen, kept when it is refused. */
  readonly form?: Readonly<Record<string, string>>;
  readonly borrower?: string;
}

export const CONDITION_KEYS: Readonly<Record<number, string>> = {
  [AID.pf7]: 'PMI',
  [AID.pf8]: 'RESERVES',
  [AID.pf9]: 'FLOOD INS',
  [AID.pf10]: 'TAX RETURNS',
};

const PROGRAM_CODES: Readonly<Record<string, string>> = {
  Conventional: 'CONV', FHA: 'FHA', VA: 'VA', Jumbo: 'JUMB',
};

export function findLoan(given: string): ServicedLoan | undefined {
  const wanted = given.trim().toUpperCase();
  return wanted ? LOANS.find((l) => l.loanNumber === wanted) : undefined;
}

/** The servicing account a boarded loan gets: 77 and the loan's last five digits. */
export function accountFor(loanNumber: string): string {
  return `77${loanNumber.slice(-5)}`;
}

const money = (n: number): string => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const pct = (n: number): string => n.toFixed(2);

const caption = (row: number, column: number, text: string, intense = false): ScreenElement =>
  ({ kind: 'caption', row, column, text, ...(intense ? { intense: true } : {}) });

function header(code: string, title: string, user: string): ScreenElement[] {
  return [
    caption(0, 0, code),
    caption(0, 28, 'MERIDIAN HOME LENDING', true),
    ...(user ? [caption(0, 70, user)] : []),
    caption(1, 26, title),
  ];
}

function messageRow(state: ServicingState): ScreenElement[] {
  return state.message ? [caption(20, 0, state.message.text, true)] : [];
}

function signonScreen(state: ServicingState): ScreenDefinition {
  return {
    name: 'LSV01',
    cursorAt: 'userId',
    elements: [
      caption(0, 0, 'LSV01'),
      caption(0, 28, 'MERIDIAN HOME LENDING', true),
      caption(1, 26, 'LOAN SERVICING - SIGN ON'),
      caption(4, 2, 'USERID   ===>'),
      { kind: 'input', name: 'userId', row: 4, column: 16, length: 8 },
      caption(6, 2, 'PASSWORD ===>'),
      { kind: 'input', name: 'password', row: 6, column: 16, length: 8, hidden: true },
      caption(9, 2, 'TRAINING SYSTEM. NO LIVE BORROWER DATA.'),
      ...messageRow(state),
      caption(22, 0, 'ENTER=SIGN ON   PF3=EXIT'),
    ],
  };
}

function inquiryScreen(state: ServicingState): ScreenDefinition {
  return {
    name: 'LSV10',
    cursorAt: 'loanNumber',
    elements: [
      ...header('LSV10', 'LOAN SERVICING - INQUIRY', state.user),
      caption(4, 2, 'LOAN NUMBER ===>'),
      { kind: 'input', name: 'loanNumber', row: 4, column: 19, length: 12 },
      ...messageRow(state),
      caption(22, 0, 'ENTER=INQUIRE  PF4=BOARD A NEW LOAN  PF6=BORROWER LOANS  PF3=SIGN OFF'),
    ],
  };
}

function detailScreen(state: ServicingState, loan: ServicedLoan): ScreenDefinition {
  const status = state.decided[loan.loanNumber] ?? 'IN UNDERWRITING';
  const conditions = state.conditions[loan.loanNumber] ?? [];
  const pair = (row: number, left: string, leftValue: string, right?: string, rightValue?: string): ScreenElement[] => [
    caption(row, 2, left), caption(row, 17, leftValue, true),
    ...(right ? [caption(row, 41, right), caption(row, 54, rightValue ?? '', true)] : []),
  ];
  return {
    name: `LSV20:${loan.loanNumber}`,
    elements: [
      ...header('LSV20', 'LOAN SERVICING - LOAN DETAIL', state.user),
      ...pair(3, 'LOAN NUMBER  :', loan.loanNumber, 'STATUS     :', status),
      ...pair(4, 'BORROWER     :', loan.borrower.toUpperCase()),
      ...pair(6, 'PROGRAM      :', loan.program.toUpperCase(), 'LOAN AMOUNT:', money(loan.amount)),
      ...pair(7, 'PROPERTY     :', loan.property.toUpperCase(), 'FLOOD ZONE :', loan.flood),
      ...pair(8, 'LTV          :', pct(loan.ltv), 'DTI        :', pct(loan.dti)),
      ...pair(9, 'FICO         :', String(loan.fico), 'RESERVES   :', `${loan.reserves} MOS`),
      ...pair(10, 'FIRST-TIME   :', loan.firstTime ? 'Y' : 'N', 'EDUCATION  :', loan.education.toUpperCase()),
      ...pair(11, 'EMPLOYMENT   :', loan.employment.toUpperCase(), 'NOTE RATE  :', loan.noteRate.toFixed(3)),
      caption(13, 2, 'CONDITIONS ON FILE :'), caption(13, 23, conditions.length ? conditions.join(', ') : 'NONE', true),
      ...messageRow(state),
      caption(22, 0, 'PF3=RETURN  PF5=APPROVE  PF6=REFER  PF7=ATTACH PMI'),
      caption(23, 0, 'PF8=ATTACH RESERVES  PF9=ATTACH FLOOD INS  PF10=ATTACH TAX RETURNS'),
    ],
  };
}

function boardScreen(state: ServicingState): ScreenDefinition {
  const f = state.form ?? {};
  const account = state.loan ? state.boarded[state.loan] : undefined;
  const input = (name: string, row: number, label: string, length: number): ScreenElement[] => [
    caption(row, 2, label),
    { kind: 'input', name, row, column: 20, length, ...(f[name] ? { value: f[name] } : {}) },
  ];
  return {
    name: 'LSV40',
    cursorAt: 'loanNumber',
    elements: [
      ...header('LSV40', 'LOAN SERVICING - BOARD A NEW LOAN', state.user),
      ...input('loanNumber', 4, 'LOAN NUMBER  ===>', 12),
      ...input('borrower', 5, 'BORROWER     ===>', 24),
      ...input('amount', 6, 'LOAN AMOUNT  ===>', 12),
      ...input('noteRate', 7, 'NOTE RATE    ===>', 6),
      ...input('program', 8, 'PROGRAM      ===>', 4),
      caption(8, 26, '(CONV FHA VA JUMB)'),
      ...(account ? [caption(11, 2, 'SERVICING ACCOUNT :'), caption(11, 22, account, true)] : []),
      ...messageRow(state),
      caption(22, 0, 'PF3=RETURN   PF10=SUBMIT'),
    ],
  };
}

function borrowerScreen(state: ServicingState): ScreenDefinition {
  const name = state.borrower ?? '';
  const loans = name ? EXISTING[name] ?? [] : [];
  const worst = loans.reduce((m, l) => Math.max(m, l.daysPastDue), 0);
  return {
    name: 'LSV50',
    cursorAt: 'borrower',
    elements: [
      ...header('LSV50', 'LOAN SERVICING - BORROWER LOANS', state.user),
      caption(3, 2, 'BORROWER ===>'),
      { kind: 'input', name: 'borrower', row: 3, column: 16, length: 24, ...(name ? { value: name } : {}) },
      ...(name ? [
        caption(5, 2, 'ACCOUNTS WITH US    :'), caption(5, 24, String(loans.length), true),
        caption(6, 2, 'WORST DAYS PAST DUE :'), caption(6, 24, String(worst), true),
        caption(8, 2, 'ACCOUNT'), caption(8, 12, 'TYPE'), caption(8, 20, 'BALANCE'), caption(8, 34, 'DAYS PAST DUE'),
        ...loans.flatMap((l, i) => [
          caption(9 + i, 2, l.account, true), caption(9 + i, 12, l.type, true),
          caption(9 + i, 20, money(l.balance), true), caption(9 + i, 34, String(l.daysPastDue), true),
        ]),
      ] : []),
      ...messageRow(state),
      caption(22, 0, 'ENTER=INQUIRE   PF3=RETURN'),
    ],
  };
}

function said(state: ServicingState, text: string, error = false): ServicingState {
  return { ...state, message: { text, error } };
}

function quiet(state: ServicingState): ServicingState {
  const { message: _, ...rest } = state;
  return rest;
}

/** Boarding, checked the way a servicing system checks it. */
function board(state: ServicingState, fields: ReadonlyMap<string, string>): ServicingState {
  const form = Object.fromEntries(['loanNumber', 'borrower', 'amount', 'noteRate', 'program']
    .map((k) => [k, (fields.get(k) ?? state.form?.[k] ?? '').trim()]));
  const kept = { ...state, form };
  const loan = findLoan(form['loanNumber'] ?? '');
  if (!loan) return said(kept, 'LSV401E NO LOAN MATCHES THAT NUMBER', true);
  if (state.boarded[loan.loanNumber]) {
    return said({ ...kept, loan: loan.loanNumber }, `LSV406E LOAN ALREADY BOARDED - ACCOUNT ${state.boarded[loan.loanNumber]}`, true);
  }
  if (!form['borrower']) return said(kept, 'LSV402E ENTER THE BORROWER', true);
  const amount = Number((form['amount'] ?? '').replace(/[$,\s]/g, ''));
  if (!Number.isFinite(amount) || amount <= 0) return said(kept, 'LSV403E AMOUNT IS NOT A NUMBER', true);
  const program = (form['program'] ?? '').toUpperCase();
  if (!Object.values(PROGRAM_CODES).includes(program)) return said(kept, 'LSV404E PROGRAM MUST BE CONV FHA VA OR JUMB', true);
  const rate = Number((form['noteRate'] ?? '').replace(/[%\s]/g, ''));
  if (!Number.isFinite(rate) || rate < 3 || rate > 9) return said(kept, 'LSV407E NOTE RATE OUTSIDE PROGRAM RANGE', true);
  const account = accountFor(loan.loanNumber);
  return said({ ...kept, loan: loan.loanNumber, boarded: { ...state.boarded, [loan.loanNumber]: account } },
    `LSV405I LOAN BOARDED. SERVICING ACCOUNT ${account}`);
}

export const LOAN_SERVICING: HostedApplication<ServicingState> = {
  start: () => ({ screen: 'signon', user: '', decided: {}, conditions: {}, boarded: {} }),

  render(state) {
    if (state.screen === 'signon') return signonScreen(state);
    if (state.screen === 'inquiry') return inquiryScreen(state);
    if (state.screen === 'board') return boardScreen(state);
    if (state.screen === 'borrower') return borrowerScreen(state);
    const loan = findLoan(state.loan ?? '');
    return loan ? detailScreen(state, loan) : inquiryScreen(state);
  },

  advance(state, aid, fields) {
    const s = quiet(state);
    switch (state.screen) {
      case 'signon': {
        if (aid !== AID.enter) return s;
        const user = (fields.get('userId') ?? '').trim().toUpperCase();
        const password = (fields.get('password') ?? '').trim();
        if (!user || !password) return said(s, 'LSV012E ENTER A USERID AND PASSWORD', true);
        return { ...s, screen: 'inquiry', user };
      }
      case 'inquiry': {
        if (aid === AID.pf3) return LOAN_SERVICING.start();
        if (aid === AID.pf4) { const { form: _, ...rest } = s; return { ...rest, screen: 'board' }; }
        if (aid === AID.pf6) { const { borrower: _, ...rest } = s; return { ...rest, screen: 'borrower' }; }
        if (aid !== AID.enter) return s;
        const typed = fields.get('loanNumber') ?? '';
        if (!typed.trim()) return said(s, 'LSV101E ENTER A LOAN NUMBER', true);
        const loan = findLoan(typed);
        return loan ? { ...s, screen: 'detail', loan: loan.loanNumber } : said(s, 'LSV102E NO LOAN MATCHES THAT NUMBER', true);
      }
      case 'detail': {
        const loan = state.loan ?? '';
        if (aid === AID.pf3) return { ...s, screen: 'inquiry' };
        const decided = state.decided[loan];
        if (aid === AID.pf5 || aid === AID.pf6) {
          if (decided) return said(s, `LSV206E LOAN ALREADY ${decided}`, true);
          const to = aid === AID.pf5 ? 'APPROVED' : 'REFERRED TO SENIOR UW';
          return said({ ...s, decided: { ...state.decided, [loan]: to } },
            aid === AID.pf5 ? 'LSV205I LOAN APPROVED' : 'LSV208I LOAN REFERRED TO A SENIOR UNDERWRITER');
        }
        const condition = CONDITION_KEYS[aid];
        if (condition) {
          if (decided) return said(s, `LSV206E LOAN ALREADY ${decided}`, true);
          const now = state.conditions[loan] ?? [];
          if (now.includes(condition)) return said(s, `LSV209E ${condition} CONDITION ALREADY ATTACHED`, true);
          return said({ ...s, conditions: { ...state.conditions, [loan]: [...now, condition] } },
            `LSV207I ${condition} CONDITION ATTACHED`);
        }
        return s;
      }
      case 'board': {
        if (aid === AID.pf3) return { ...s, screen: 'inquiry' };
        if (aid !== AID.pf10) return s;
        return board(s, fields);
      }
      case 'borrower': {
        if (aid === AID.pf3) return { ...s, screen: 'inquiry' };
        if (aid !== AID.enter) return s;
        const name = (fields.get('borrower') ?? '').trim().toUpperCase();
        if (!name) return said(s, 'LSV501E ENTER A BORROWER NAME', true);
        return EXISTING[name]
          ? { ...s, borrower: name }
          : said({ ...s, borrower: name }, 'LSV502I NO EXISTING LOANS WITH US');
      }
    }
  },
};

/** The program codes the boarding screen takes, keyed by what the web portal calls each. */
export { PROGRAM_CODES };
