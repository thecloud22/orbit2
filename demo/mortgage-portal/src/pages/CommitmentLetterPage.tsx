import { useState } from 'react';

import { Shell } from '../components/Shell';
import { findLoan, loanToValue, PROGRAM_LABELS, type Loan } from '../data/loans';

/** Stubbed but arithmetically real: percentages of loan amount, not fixed numbers. */
function closingCosts(loan: Loan) {
  const originationFee = Math.round(loan.loanAmount * 0.01);
  const appraisalFee = 650;
  const titleInsurance = Math.round(loan.purchasePrice * 0.005);
  const recordingFee = 185;
  const prepaidInterest = Math.round(((loan.loanAmount * loan.noteRate) / 100 / 365) * 15);
  const total = originationFee + appraisalFee + titleInsurance + recordingFee + prepaidInterest;
  const downPayment = loan.purchasePrice - loan.loanAmount;
  const cashToClose = downPayment + total;
  return { originationFee, appraisalFee, titleInsurance, recordingFee, prepaidInterest, total, cashToClose };
}

/**
 * A read-only, generated document rather than another form -- the shape a
 * real closing disclosure takes once a file is done being decided. Every
 * figure here is computed from the file's own numbers (loan amount, purchase
 * price, note rate), not a placeholder, so `extract` has something real to
 * read a value off of.
 */
export function CommitmentLetterPage() {
  const params = new URLSearchParams(window.location.search);
  const loan = findLoan(params.get('loan') ?? '');
  const [generated, setGenerated] = useState(false);

  if (loan === undefined) {
    return (
      <Shell>
        <div className="mx-auto max-w-2xl px-6 py-16">
          <h1 className="text-xl font-semibold text-slate-900">File not found</h1>
          <p className="mt-2 text-sm text-slate-600" data-testid="loan-not-found">
            No file matches that loan number.{' '}
            <a className="text-sky-700 underline" href="/pipeline">
              Back to the pipeline
            </a>
          </p>
        </div>
      </Shell>
    );
  }

  const costs = closingCosts(loan);

  return (
    <Shell>
      <div className="mx-auto max-w-2xl px-6 py-10">
        <a className="text-xs text-sky-700 hover:underline" href="/pipeline">
          ← Pipeline
        </a>

        <h1 className="mt-2 font-mono text-2xl font-semibold text-slate-900" data-testid="loan-number">
          {loan.loanNumber}
        </h1>
        <p className="mt-0.5 text-sm text-slate-600" data-testid="borrower-name">
          {loan.borrowerName}
        </p>

        {!generated ? (
          <button
            className="mt-5 rounded bg-sky-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-sky-500"
            data-testid="generate-commitment-letter-button"
            onClick={() => setGenerated(true)}
            type="button"
          >
            Generate commitment letter
          </button>
        ) : (
          <div
            className="mt-5 space-y-5 rounded-lg border border-slate-200 bg-white p-6 shadow-sm"
            data-testid="commitment-letter"
          >
            <div>
              <h2 className="text-sm font-semibold text-slate-900">Loan terms</h2>
              <dl className="mt-2 grid grid-cols-2 gap-y-1 text-sm">
                <dt className="text-slate-500">Program</dt>
                <dd className="text-right font-mono text-slate-900" data-testid="letter-program">
                  {PROGRAM_LABELS[loan.program]}
                </dd>
                <dt className="text-slate-500">Loan amount</dt>
                <dd className="text-right font-mono text-slate-900" data-testid="letter-loan-amount">
                  ${loan.loanAmount.toLocaleString('en-US')}
                </dd>
                <dt className="text-slate-500">Note rate</dt>
                <dd className="text-right font-mono text-slate-900" data-testid="letter-note-rate">
                  {loan.noteRate}%
                </dd>
                <dt className="text-slate-500">Loan-to-value</dt>
                <dd className="text-right font-mono text-slate-900" data-testid="letter-ltv">
                  {loanToValue(loan).toFixed(2)}%
                </dd>
              </dl>
            </div>

            <div className="border-t border-slate-100 pt-4">
              <h2 className="text-sm font-semibold text-slate-900">Estimated closing costs</h2>
              <dl className="mt-2 grid grid-cols-2 gap-y-1 text-sm">
                <dt className="text-slate-500">Origination fee</dt>
                <dd className="text-right font-mono text-slate-900" data-testid="letter-origination-fee">
                  ${costs.originationFee.toLocaleString('en-US')}
                </dd>
                <dt className="text-slate-500">Appraisal fee</dt>
                <dd className="text-right font-mono text-slate-900" data-testid="letter-appraisal-fee">
                  ${costs.appraisalFee.toLocaleString('en-US')}
                </dd>
                <dt className="text-slate-500">Title insurance</dt>
                <dd className="text-right font-mono text-slate-900" data-testid="letter-title-insurance">
                  ${costs.titleInsurance.toLocaleString('en-US')}
                </dd>
                <dt className="text-slate-500">Recording fee</dt>
                <dd className="text-right font-mono text-slate-900" data-testid="letter-recording-fee">
                  ${costs.recordingFee.toLocaleString('en-US')}
                </dd>
                <dt className="text-slate-500">Prepaid interest (15 days)</dt>
                <dd className="text-right font-mono text-slate-900" data-testid="letter-prepaid-interest">
                  ${costs.prepaidInterest.toLocaleString('en-US')}
                </dd>
                <dt className="font-semibold text-slate-700">Total closing costs</dt>
                <dd
                  className="text-right font-mono font-semibold text-slate-900"
                  data-testid="letter-total-closing-costs"
                >
                  ${costs.total.toLocaleString('en-US')}
                </dd>
              </dl>
            </div>

            <div className="border-t border-slate-100 pt-4">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-slate-900">Estimated cash to close</span>
                <span className="font-mono text-lg font-semibold text-slate-900" data-testid="letter-cash-to-close">
                  ${costs.cashToClose.toLocaleString('en-US')}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    </Shell>
  );
}
