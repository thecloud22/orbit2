import { useState } from 'react';

import { PORTAL_NAME } from '../app/app-info';
import { findLoan, PROGRAM_LABELS, STATUS_LABELS } from '../data/loans';

const BORROWER_STATUS_COPY: Readonly<Record<string, string>> = {
  in_underwriting: 'Your file is being reviewed by an underwriter.',
  conditionally_approved: 'Approved, pending a few remaining items.',
  approved: 'Your loan is approved.',
  referred_to_senior: 'Your file is being reviewed by a senior underwriter.',
  declined: 'A decision has been made on your file.',
};

const UPLOADS = [
  { id: 'pay-stubs', label: 'Pay stubs' },
  { id: 'tax-returns', label: 'Tax returns' },
  { id: 'bank-statements', label: 'Bank statements' },
] as const;

/**
 * What the borrower sees, which is not the underwriter's screen with fewer
 * pixels -- it's a genuinely different set of facts. No loan-to-value, no
 * debt-to-income, no credit score, no underwriter name: those are the
 * figures a decision is judged against, not something a borrower is shown
 * mid-file on a real portal. Status reads in plain language instead of the
 * internal status label.
 */
export function BorrowerDashboardPage() {
  const params = new URLSearchParams(window.location.search);
  const loan = findLoan(params.get('loan') ?? '');
  const [uploaded, setUploaded] = useState<readonly string[]>([]);

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="border-b border-slate-800 bg-slate-900">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-6 py-3">
          <span className="flex h-8 w-8 items-center justify-center rounded bg-emerald-500 text-sm font-bold text-white">
            M
          </span>
          <span className="text-sm font-semibold text-white">{PORTAL_NAME} · Borrower portal</span>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 py-8">
        {loan === undefined ? (
          <p className="text-sm text-slate-600" data-testid="loan-not-found">
            No file matches that loan number.{' '}
            <a className="text-emerald-700 underline" href="/borrower/login">
              Back to sign in
            </a>
          </p>
        ) : (
          <>
            <h1 className="font-mono text-xl font-semibold text-slate-900" data-testid="loan-number">
              {loan.loanNumber}
            </h1>

            <div
              className="mt-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm"
              data-testid="borrower-status"
            >
              <div className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
                Status
              </div>
              <p className="mt-1 text-sm text-slate-900">
                {BORROWER_STATUS_COPY[loan.status] ?? STATUS_LABELS[loan.status]}
              </p>
            </div>

            <div className="mt-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <div className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
                Your loan
              </div>
              <dl className="mt-2 grid grid-cols-2 gap-y-1 text-sm">
                <dt className="text-slate-500">Property</dt>
                <dd className="text-right text-slate-900" data-testid="borrower-property">
                  {loan.propertyAddress}, {loan.propertyCity} {loan.propertyState}
                </dd>
                <dt className="text-slate-500">Program</dt>
                <dd className="text-right text-slate-900">{PROGRAM_LABELS[loan.program]}</dd>
                <dt className="text-slate-500">Submitted</dt>
                <dd className="text-right font-mono text-slate-900">{loan.submittedOn}</dd>
              </dl>
            </div>

            <div className="mt-4 rounded-lg border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-100 px-4 py-2.5">
                <h2 className="text-sm font-semibold text-slate-900">Documents we need from you</h2>
              </div>
              <ul className="divide-y divide-slate-100">
                {UPLOADS.map((item) => {
                  const done = uploaded.includes(item.id);
                  return (
                    <li
                      className="flex items-center justify-between px-4 py-3"
                      data-testid={`borrower-upload-${item.id}`}
                      key={item.id}
                    >
                      <span className="text-sm text-slate-800">{item.label}</span>
                      {done ? (
                        <span
                          className="rounded-full border border-emerald-300 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-800"
                          data-testid={`borrower-upload-status-${item.id}`}
                        >
                          Uploaded
                        </span>
                      ) : (
                        <button
                          className="rounded border border-slate-300 px-2.5 py-1 text-xs text-slate-700 transition-colors hover:border-emerald-400 hover:bg-emerald-50"
                          data-testid={`borrower-upload-button-${item.id}`}
                          onClick={() => setUploaded((current) => [...current, item.id])}
                          type="button"
                        >
                          Upload
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
