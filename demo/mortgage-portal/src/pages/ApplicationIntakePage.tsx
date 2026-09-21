import { useState } from 'react';

import { Shell } from '../components/Shell';
import {
  CONFORMING_LIMIT,
  debtToIncome,
  EDUCATION_LABELS,
  EMPLOYMENT_LABELS,
  loanToValue,
  OCCUPANCY_LABELS,
  PROGRAM_LABELS,
  PROGRAM_MIN_CREDIT_SCORE,
  PROPERTY_LABELS,
  submitApplication,
  type EducationStatus,
  type EmploymentType,
  type FloodZone,
  type Loan,
  type LoanProgram,
  type Occupancy,
  type PropertyType,
} from '../data/loans';

interface FormState {
  borrowerName: string;
  hasCoBorrower: boolean;
  coBorrowerName: string;
  firstTimeBuyer: boolean;
  homebuyerEducation: EducationStatus | '';
  employmentType: EmploymentType | '';
  employmentNote: string;
  yearsInRole: string;
  monthlyIncome: string;
  monthlyDebt: string;
  creditScore: string;
  propertyAddress: string;
  propertyCity: string;
  propertyState: string;
  propertyType: PropertyType | '';
  occupancy: Occupancy | '';
  floodZone: FloodZone | '';
  program: LoanProgram | '';
  purchasePrice: string;
  appraisedValue: string;
  loanAmount: string;
  reserveMonths: string;
  noteRate: string;
}

const INITIAL_FORM: FormState = {
  borrowerName: '',
  hasCoBorrower: false,
  coBorrowerName: '',
  firstTimeBuyer: false,
  homebuyerEducation: '',
  employmentType: '',
  employmentNote: '',
  yearsInRole: '',
  monthlyIncome: '',
  monthlyDebt: '',
  creditScore: '',
  propertyAddress: '',
  propertyCity: '',
  propertyState: '',
  propertyType: '',
  occupancy: '',
  floodZone: '',
  program: '',
  purchasePrice: '',
  appraisedValue: '',
  loanAmount: '',
  reserveMonths: '',
  noteRate: '',
};

const STEP_TITLES = ['Borrower', 'Employment & income', 'Property & program', 'Review & submit'];

function isStep1Valid(form: FormState): boolean {
  return (
    form.borrowerName.trim() !== '' &&
    form.homebuyerEducation !== '' &&
    (!form.hasCoBorrower || form.coBorrowerName.trim() !== '')
  );
}

function isStep2Valid(form: FormState): boolean {
  return (
    form.employmentType !== '' &&
    form.employmentNote.trim() !== '' &&
    form.yearsInRole !== '' &&
    form.monthlyIncome !== '' &&
    form.monthlyDebt !== '' &&
    form.creditScore !== ''
  );
}

function isStep3Valid(form: FormState): boolean {
  return (
    form.propertyAddress.trim() !== '' &&
    form.propertyCity.trim() !== '' &&
    form.propertyState.trim() !== '' &&
    form.propertyType !== '' &&
    form.occupancy !== '' &&
    form.floodZone !== '' &&
    form.program !== '' &&
    form.purchasePrice !== '' &&
    form.appraisedValue !== '' &&
    form.loanAmount !== '' &&
    form.reserveMonths !== '' &&
    form.noteRate !== ''
  );
}

/** A `Loan`-shaped preview of the form so far, for the review step's figures. */
function previewLoan(form: FormState): Loan {
  return {
    loanNumber: 'PREVIEW',
    borrowerName: form.borrowerName,
    coBorrowerName: form.hasCoBorrower ? form.coBorrowerName : null,
    firstTimeBuyer: form.firstTimeBuyer,
    homebuyerEducation: (form.homebuyerEducation || 'none') as EducationStatus,
    employmentType: (form.employmentType || 'w2') as EmploymentType,
    employmentNote: form.employmentNote,
    yearsInRole: Number(form.yearsInRole || 0),
    propertyAddress: form.propertyAddress,
    propertyCity: form.propertyCity,
    propertyState: form.propertyState,
    propertyType: (form.propertyType || 'single_family') as PropertyType,
    occupancy: (form.occupancy || 'primary') as Occupancy,
    floodZone: (form.floodZone || 'X') as FloodZone,
    program: (form.program || 'conventional') as LoanProgram,
    purchasePrice: Number(form.purchasePrice || 0),
    appraisedValue: Number(form.appraisedValue || 0),
    loanAmount: Number(form.loanAmount || 0),
    monthlyIncome: Number(form.monthlyIncome || 0),
    monthlyDebt: Number(form.monthlyDebt || 0),
    creditScore: Number(form.creditScore || 0),
    reserveMonths: Number(form.reserveMonths || 0),
    noteRate: Number(form.noteRate || 0),
    status: 'in_underwriting',
    submittedOn: '',
    underwriter: '',
  };
}

/**
 * The form none of the other pages have: the one that puts a file on the
 * pipeline in the first place. Every other loan on this portal is
 * pre-seeded; this is where a ninth, tenth, eleventh one comes from.
 *
 * Four steps rather than one long form, because that is how an intake form
 * actually reduces abandonment -- and because a recorded workflow that fills
 * a wizard has to survive Next/Back the same way a person does. The review
 * step's rule chips are read off the same thresholds the underwriting screen
 * already displays (LTV, DTI, program credit floor, conforming limit) so an
 * applicant sees, before submitting, the same math a human underwriter is
 * about to be shown.
 */
export function ApplicationIntakePage() {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [submitted, setSubmitted] = useState<Loan | null>(null);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function submit() {
    const preview = previewLoan(form);
    const loan = submitApplication({
      borrowerName: preview.borrowerName,
      coBorrowerName: preview.coBorrowerName,
      firstTimeBuyer: preview.firstTimeBuyer,
      homebuyerEducation: preview.homebuyerEducation,
      employmentType: preview.employmentType,
      employmentNote: preview.employmentNote,
      yearsInRole: preview.yearsInRole,
      propertyAddress: preview.propertyAddress,
      propertyCity: preview.propertyCity,
      propertyState: preview.propertyState,
      propertyType: preview.propertyType,
      occupancy: preview.occupancy,
      floodZone: preview.floodZone,
      program: preview.program,
      purchasePrice: preview.purchasePrice,
      appraisedValue: preview.appraisedValue,
      loanAmount: preview.loanAmount,
      monthlyIncome: preview.monthlyIncome,
      monthlyDebt: preview.monthlyDebt,
      creditScore: preview.creditScore,
      reserveMonths: preview.reserveMonths,
      noteRate: preview.noteRate,
    });
    setSubmitted(loan);
  }

  if (submitted !== null) {
    return (
      <Shell>
        <div className="mx-auto max-w-xl px-6 py-16" data-testid="application-confirmation">
          <h1 className="text-xl font-semibold text-slate-900">Application submitted</h1>
          <p className="mt-2 text-sm text-slate-600">
            File{' '}
            <span className="font-mono font-semibold text-slate-900" data-testid="application-loan-number">
              {submitted.loanNumber}
            </span>{' '}
            has been added to the pipeline, unassigned.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <a
              className="rounded bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-500"
              data-testid="open-in-underwriting-link"
              href={`/underwriting?loan=${encodeURIComponent(submitted.loanNumber)}`}
            >
              Open in underwriting
            </a>
            <a
              className="rounded border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
              data-testid="submit-another-link"
              href="/applications/new"
            >
              Submit another application
            </a>
          </div>
        </div>
      </Shell>
    );
  }

  const stepValid =
    step === 1 ? isStep1Valid(form) : step === 2 ? isStep2Valid(form) : isStep3Valid(form);

  return (
    <Shell>
      <div className="mx-auto max-w-3xl px-6 py-8">
        <h1 className="text-xl font-semibold text-slate-900">New loan application</h1>

        <ol className="mt-4 flex flex-wrap gap-2" data-testid="apply-step-indicator">
          {STEP_TITLES.map((title, index) => {
            const number = index + 1;
            return (
              <li
                className={`rounded-full border px-3 py-1 text-xs font-medium ${
                  number === step
                    ? 'border-sky-400 bg-sky-50 text-sky-800'
                    : number < step
                      ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                      : 'border-slate-300 text-slate-500'
                }`}
                key={title}
              >
                {number}. {title}
              </li>
            );
          })}
        </ol>

        <div className="mt-6 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          {step === 1 && (
            <div className="space-y-4" data-testid="apply-step-1">
              <Field label="Borrower full name" testId="apply-borrower-name">
                <input
                  className={INPUT_CLASS}
                  data-testid="apply-borrower-name-input"
                  onChange={(event) => set('borrowerName', event.target.value)}
                  required
                  type="text"
                  value={form.borrowerName}
                />
              </Field>

              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  checked={form.hasCoBorrower}
                  data-testid="apply-has-coborrower-input"
                  onChange={(event) => set('hasCoBorrower', event.target.checked)}
                  type="checkbox"
                />
                Add a co-borrower
              </label>

              {form.hasCoBorrower && (
                <Field label="Co-borrower full name" testId="apply-coborrower-name">
                  <input
                    className={INPUT_CLASS}
                    data-testid="apply-coborrower-name-input"
                    onChange={(event) => set('coBorrowerName', event.target.value)}
                    required
                    type="text"
                    value={form.coBorrowerName}
                  />
                </Field>
              )}

              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  checked={form.firstTimeBuyer}
                  data-testid="apply-first-time-buyer-input"
                  onChange={(event) => set('firstTimeBuyer', event.target.checked)}
                  type="checkbox"
                />
                First-time homebuyer
              </label>

              <Field label="Homebuyer education" testId="apply-homebuyer-education">
                <select
                  className={INPUT_CLASS}
                  data-testid="apply-homebuyer-education-input"
                  onChange={(event) =>
                    set('homebuyerEducation', event.target.value as EducationStatus)
                  }
                  required
                  value={form.homebuyerEducation}
                >
                  <option value="">Select…</option>
                  {Object.entries(EDUCATION_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
          )}

          {step === 2 && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2" data-testid="apply-step-2">
              <Field label="Employment type" testId="apply-employment-type">
                <select
                  className={INPUT_CLASS}
                  data-testid="apply-employment-type-input"
                  onChange={(event) => set('employmentType', event.target.value as EmploymentType)}
                  required
                  value={form.employmentType}
                >
                  <option value="">Select…</option>
                  {Object.entries(EMPLOYMENT_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Years in role" testId="apply-years-in-role">
                <input
                  className={INPUT_CLASS}
                  data-testid="apply-years-in-role-input"
                  min={0}
                  onChange={(event) => set('yearsInRole', event.target.value)}
                  required
                  type="number"
                  value={form.yearsInRole}
                />
              </Field>

              <div className="sm:col-span-2">
                <Field label="Employment note" testId="apply-employment-note">
                  <textarea
                    className={INPUT_CLASS}
                    data-testid="apply-employment-note-input"
                    onChange={(event) => set('employmentNote', event.target.value)}
                    required
                    rows={3}
                    value={form.employmentNote}
                  />
                </Field>
              </div>

              <Field label="Monthly income ($)" testId="apply-monthly-income">
                <input
                  className={INPUT_CLASS}
                  data-testid="apply-monthly-income-input"
                  min={0}
                  onChange={(event) => set('monthlyIncome', event.target.value)}
                  required
                  type="number"
                  value={form.monthlyIncome}
                />
              </Field>

              <Field label="Monthly debt ($)" testId="apply-monthly-debt">
                <input
                  className={INPUT_CLASS}
                  data-testid="apply-monthly-debt-input"
                  min={0}
                  onChange={(event) => set('monthlyDebt', event.target.value)}
                  required
                  type="number"
                  value={form.monthlyDebt}
                />
              </Field>

              <Field label="Credit score" testId="apply-credit-score">
                <input
                  className={INPUT_CLASS}
                  data-testid="apply-credit-score-input"
                  max={850}
                  min={300}
                  onChange={(event) => set('creditScore', event.target.value)}
                  required
                  type="number"
                  value={form.creditScore}
                />
              </Field>
            </div>
          )}

          {step === 3 && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2" data-testid="apply-step-3">
              <div className="sm:col-span-2">
                <Field label="Property address" testId="apply-property-address">
                  <input
                    className={INPUT_CLASS}
                    data-testid="apply-property-address-input"
                    onChange={(event) => set('propertyAddress', event.target.value)}
                    required
                    type="text"
                    value={form.propertyAddress}
                  />
                </Field>
              </div>

              <Field label="City" testId="apply-property-city">
                <input
                  className={INPUT_CLASS}
                  data-testid="apply-property-city-input"
                  onChange={(event) => set('propertyCity', event.target.value)}
                  required
                  type="text"
                  value={form.propertyCity}
                />
              </Field>

              <Field label="State" testId="apply-property-state">
                <input
                  className={INPUT_CLASS}
                  data-testid="apply-property-state-input"
                  maxLength={2}
                  onChange={(event) => set('propertyState', event.target.value.toUpperCase())}
                  placeholder="OR"
                  required
                  type="text"
                  value={form.propertyState}
                />
              </Field>

              <Field label="Property type" testId="apply-property-type">
                <select
                  className={INPUT_CLASS}
                  data-testid="apply-property-type-input"
                  onChange={(event) => set('propertyType', event.target.value as PropertyType)}
                  required
                  value={form.propertyType}
                >
                  <option value="">Select…</option>
                  {Object.entries(PROPERTY_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Occupancy" testId="apply-occupancy">
                <select
                  className={INPUT_CLASS}
                  data-testid="apply-occupancy-input"
                  onChange={(event) => set('occupancy', event.target.value as Occupancy)}
                  required
                  value={form.occupancy}
                >
                  <option value="">Select…</option>
                  {Object.entries(OCCUPANCY_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="FEMA flood zone" testId="apply-flood-zone">
                <select
                  className={INPUT_CLASS}
                  data-testid="apply-flood-zone-input"
                  onChange={(event) => set('floodZone', event.target.value as FloodZone)}
                  required
                  value={form.floodZone}
                >
                  <option value="">Select…</option>
                  {(['X', 'AE', 'AO', 'VE'] as const).map((zone) => (
                    <option key={zone} value={zone}>
                      {zone}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Loan program" testId="apply-program">
                <select
                  className={INPUT_CLASS}
                  data-testid="apply-program-input"
                  onChange={(event) => set('program', event.target.value as LoanProgram)}
                  required
                  value={form.program}
                >
                  <option value="">Select…</option>
                  {Object.entries(PROGRAM_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </Field>

              <Field label="Purchase price ($)" testId="apply-purchase-price">
                <input
                  className={INPUT_CLASS}
                  data-testid="apply-purchase-price-input"
                  min={0}
                  onChange={(event) => set('purchasePrice', event.target.value)}
                  required
                  type="number"
                  value={form.purchasePrice}
                />
              </Field>

              <Field label="Appraised value ($)" testId="apply-appraised-value">
                <input
                  className={INPUT_CLASS}
                  data-testid="apply-appraised-value-input"
                  min={0}
                  onChange={(event) => set('appraisedValue', event.target.value)}
                  required
                  type="number"
                  value={form.appraisedValue}
                />
              </Field>

              <Field label="Loan amount ($)" testId="apply-loan-amount">
                <input
                  className={INPUT_CLASS}
                  data-testid="apply-loan-amount-input"
                  min={0}
                  onChange={(event) => set('loanAmount', event.target.value)}
                  required
                  type="number"
                  value={form.loanAmount}
                />
              </Field>

              <Field label="Reserves (months)" testId="apply-reserve-months">
                <input
                  className={INPUT_CLASS}
                  data-testid="apply-reserve-months-input"
                  min={0}
                  onChange={(event) => set('reserveMonths', event.target.value)}
                  required
                  type="number"
                  value={form.reserveMonths}
                />
              </Field>

              <Field label="Note rate (%)" testId="apply-note-rate">
                <input
                  className={INPUT_CLASS}
                  data-testid="apply-note-rate-input"
                  min={0}
                  onChange={(event) => set('noteRate', event.target.value)}
                  required
                  step="0.001"
                  type="number"
                  value={form.noteRate}
                />
              </Field>
            </div>
          )}

          {step === 4 && <ReviewStep form={form} />}

          <div className="mt-6 flex justify-between border-t border-slate-100 pt-4">
            <button
              className="rounded border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
              data-testid="apply-back-button"
              disabled={step === 1}
              onClick={() => setStep((current) => Math.max(1, current - 1))}
              type="button"
            >
              Back
            </button>

            {step < 4 ? (
              <button
                className="rounded bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-40"
                data-testid="apply-next-button"
                disabled={!stepValid}
                onClick={() => setStep((current) => Math.min(4, current + 1))}
                type="button"
              >
                Next
              </button>
            ) : (
              <button
                className="rounded bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-500"
                data-testid="apply-submit-button"
                onClick={submit}
                type="button"
              >
                Submit application
              </button>
            )}
          </div>
        </div>
      </div>
    </Shell>
  );
}

const INPUT_CLASS =
  'mt-1.5 w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:ring-1 focus:ring-sky-500 focus:outline-none';

function Field({
  label,
  testId,
  children,
}: {
  label: string;
  testId: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block text-sm text-slate-700" data-testid={testId}>
      <span className="text-xs font-semibold tracking-wide text-slate-500 uppercase">{label}</span>
      {children}
    </label>
  );
}

function ReviewStep({ form }: { form: FormState }) {
  const preview = previewLoan(form);
  const ltv = loanToValue(preview);
  const dti = debtToIncome(preview);
  const minCredit = form.program === '' ? 0 : PROGRAM_MIN_CREDIT_SCORE[form.program];

  const rules = [
    {
      key: 'credit-score',
      pass: preview.creditScore >= minCredit,
      label: `Credit score ${preview.creditScore} meets the ${PROGRAM_LABELS[preview.program]} floor of ${minCredit}`,
    },
    { key: 'ltv', pass: ltv <= 97, label: `Loan-to-value ${ltv.toFixed(2)}% is at or under 97%` },
    { key: 'dti', pass: dti <= 43, label: `Debt-to-income ${dti.toFixed(2)}% is at or under 43%` },
    {
      key: 'conforming-limit',
      pass: preview.program === 'jumbo' || preview.loanAmount <= CONFORMING_LIMIT,
      label:
        preview.program === 'jumbo'
          ? 'Jumbo program, conforming limit does not apply'
          : `Loan amount is at or under the conforming limit ($${CONFORMING_LIMIT.toLocaleString('en-US')})`,
    },
  ] as const;

  return (
    <div data-testid="apply-step-4">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Figure label="Loan-to-value" testId="apply-preview-ltv" value={`${ltv.toFixed(2)}%`} />
        <Figure label="Debt-to-income" testId="apply-preview-dti" value={`${dti.toFixed(2)}%`} />
        <Figure
          label="Loan amount"
          testId="apply-preview-loan-amount"
          value={`$${preview.loanAmount.toLocaleString('en-US')}`}
        />
        <Figure label="Program" testId="apply-preview-program" value={PROGRAM_LABELS[preview.program]} />
      </div>

      <ul className="mt-5 space-y-2" data-testid="apply-rule-checks">
        {rules.map((rule) => (
          <li
            className={`flex items-start gap-2 rounded border px-3 py-2 text-sm ${
              rule.pass
                ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                : 'border-amber-300 bg-amber-50 text-amber-900'
            }`}
            data-testid={`rule-${rule.key}`}
            key={rule.key}
          >
            <span aria-hidden="true">{rule.pass ? '✓' : '!'}</span>
            {rule.label}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Figure({ label, testId, value }: { label: string; testId: string; value: string }) {
  return (
    <div>
      <div className="text-xs tracking-wide text-slate-500 uppercase">{label}</div>
      <div className="mt-0.5 font-mono text-sm text-slate-900" data-testid={testId}>
        {value}
      </div>
    </div>
  );
}
