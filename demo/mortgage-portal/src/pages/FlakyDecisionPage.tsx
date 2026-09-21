import { useState } from 'react';

import { Shell } from '../components/Shell';
import { findLoan } from '../data/loans';

/**
 * An approval that fails once before it succeeds.
 *
 * The first "Approve file" click always errors and commits nothing; the
 * second, identical click always succeeds. Real submit paths are not this
 * clean -- a transient failure is transient precisely because it is not tied
 * to the input -- but the point here is the same one `demo/README.md` makes
 * about "a control that resolves twice": a recorded workflow has to survive a
 * click that does not work the first time without treating the retry as a
 * second decision.
 */
export function FlakyDecisionPage() {
  const params = new URLSearchParams(window.location.search);
  const loan = findLoan(params.get('loan') ?? '');

  const [attempts, setAttempts] = useState(0);
  const [approved, setApproved] = useState(false);

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

  function approve() {
    if (approved) {
      return;
    }
    const attempt = attempts + 1;
    setAttempts(attempt);
    if (attempt >= 2) {
      setApproved(true);
    }
  }

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

        <div className="mt-5 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-xs tracking-wide text-slate-500 uppercase">Attempts</div>
          <div className="mt-0.5 font-mono text-lg text-slate-900" data-testid="attempt-count">
            {attempts}
          </div>
        </div>

        {approved && (
          <div
            className="mt-5 rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-3 text-emerald-900"
            data-testid="decision-status"
          >
            File approved.
          </div>
        )}

        {!approved && attempts > 0 && (
          <div
            className="mt-5 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 text-amber-900"
            data-testid="submit-error"
          >
            Network hiccup — the approval did not go through. Try again.
          </div>
        )}

        <button
          className="mt-5 w-full rounded bg-emerald-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
          data-testid="approve-button"
          disabled={approved}
          onClick={approve}
          type="button"
        >
          Approve file
        </button>
      </div>
    </Shell>
  );
}
