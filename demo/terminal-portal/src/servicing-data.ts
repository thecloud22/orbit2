/**
 * The loans the loan-servicing twin serves: the web portal's nine seeded files,
 * copied (Orbit 2.2, C16).
 *
 * Copied rather than imported, because the portal's module reaches for the
 * browser's storage and this host runs in node. The figures are the portal's
 * own, computed the way it computes them (loan-to-value against the lesser of
 * price and appraisal; debt-to-income as monthly debt over income), so the same
 * file reads the same on both systems. `servicing.test.ts` pins them.
 */
export interface ServicedLoan {
  readonly loanNumber: string;
  readonly borrower: string;
  readonly program: string;
  readonly amount: number;
  readonly noteRate: number;
  readonly ltv: number;
  readonly dti: number;
  readonly fico: number;
  readonly reserves: number;
  readonly flood: string;
  readonly property: string;
  readonly firstTime: boolean;
  readonly education: string;
  readonly employment: string;
}

export const LOANS: readonly ServicedLoan[] = [
  { loanNumber: "ML-26-04471", borrower: "Dana Okonkwo", program: "Conventional", amount: 360000, noteRate: 6.375, ltv: 72.73, dti: 28, fico: 762, reserves: 8, flood: "X", property: "Single family detached", firstTime: false, education: "Not enrolled", employment: "W-2 employee" },
  { loanNumber: "ML-26-04488", borrower: "Priya Raghunathan", program: "Conventional", amount: 396000, noteRate: 6.5, ltv: 92.09, dti: 33, fico: 728, reserves: 3, flood: "X", property: "Single family detached", firstTime: true, education: "Completed", employment: "W-2 employee" },
  { loanNumber: "ML-26-04502", borrower: "Marcus Whitfield", program: "Conventional", amount: 457500, noteRate: 6.625, ltv: 75, dti: 32.5, fico: 744, reserves: 11, flood: "X", property: "Single family detached", firstTime: false, education: "Not enrolled", employment: "Self-employed" },
  { loanNumber: "ML-26-04513", borrower: "Helena Vasquez-Byrne", program: "Conventional", amount: 291750, noteRate: 6.25, ltv: 75, dti: 28, fico: 781, reserves: 14, flood: "AE", property: "Single family detached", firstTime: false, education: "Not enrolled", employment: "W-2 employee" },
  { loanNumber: "ML-26-04529", borrower: "Elliot Sandoval", program: "Conventional", amount: 318250, noteRate: 6.875, ltv: 95, dti: 47, fico: 691, reserves: 2, flood: "X", property: "Condominium", firstTime: true, education: "Enrolled, not complete", employment: "Contract / 1099" },
  { loanNumber: "ML-26-04534", borrower: "Georgina Petrakis", program: "Jumbo", amount: 930000, noteRate: 6.75, ltv: 75, dti: 27, fico: 794, reserves: 19, flood: "X", property: "Single family detached", firstTime: false, education: "Not enrolled", employment: "W-2 employee" },
  { loanNumber: "ML-26-04570", borrower: "Adaeze Nwachukwu", program: "Conventional", amount: 349000, noteRate: 6.25, ltv: 64.04, dti: 23, fico: 771, reserves: 14, flood: "X", property: "Single family detached", firstTime: false, education: "Not enrolled", employment: "W-2 employee" },
  { loanNumber: "ML-26-04547", borrower: "Trevor Mullane", program: "FHA", amount: 327250, noteRate: 7.125, ltv: 96.25, dti: 38, fico: 596, reserves: 1, flood: "X", property: "Single family detached", firstTime: true, education: "Not enrolled", employment: "W-2 employee" },
  { loanNumber: "ML-26-04561", borrower: "Aoife Brennan", program: "Conventional", amount: 380800, noteRate: 6.5, ltv: 85, dti: 26, fico: 806, reserves: 26, flood: "VE", property: "Condominium", firstTime: false, education: "Not enrolled", employment: "Retired" },
];

/**
 * A borrower's existing loans with the lender, which only servicing knows.
 * New seed data for the existing-loan check: Priya Raghunathan's home equity
 * line is 45 days past due, so her file is referred.
 */
export interface ExistingLoan {
  readonly account: string;
  readonly type: string;
  readonly balance: number;
  readonly daysPastDue: number;
}

export const EXISTING: Readonly<Record<string, readonly ExistingLoan[]>> = {
  'PRIYA RAGHUNATHAN': [
    { account: '6610087', type: 'HELOC', balance: 48210.55, daysPastDue: 45 },
    { account: '5530126', type: 'AUTO', balance: 12904.1, daysPastDue: 0 },
  ],
  'MARCUS WHITFIELD': [
    { account: '6604512', type: 'HELOC', balance: 21750.0, daysPastDue: 0 },
  ],
  'AOIFE BRENNAN': [
    { account: '5521877', type: 'AUTO', balance: 8420.33, daysPastDue: 0 },
  ],
};
