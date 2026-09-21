import { useState } from 'react';

import { Shell } from '../components/Shell';
import { findLoan } from '../data/loans';

const DEFAULT_DELAY_MS = 2_000;
const MAX_DELAY_MS = 10_000;

/**
 * A decision that updates in place, seconds after the click.
 *
 * legacy-portal's delay fixture proves a recorder survives a slow full-page
 * POST-and-redirect. This portal never reloads the page for a decision, so
 * the same property needs a different shape here: the click resolves
 * immediately, the button goes into a pending state, and the banner an
 * assertion actually waits on doesn't exist in the DOM until the delay
 * elapses. `?delay=ms` is capped the same way legacy-portal caps its own, so
 * a slow-page test can't hold a suite open indefinitely.
 */
export function SlowDecisionPage() {
  const params = new URLSearchParams(window.location.search);
  const loan = findLoan(params.get('loan') ?? '');
  const delayMs = Math.min(Number(params.get('delay') ?? DEFAULT_DELAY_MS), MAX_DELAY_MS);

  const [submitting, setSubmitting] = useState(false);
  const [decision, setDecision] = useState<'approved' | null>(null);

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
    setSubmitting(true);
    window.setTimeout(() => {
      setSubmitting(false);
      setDecision('approved');
    }, delayMs);
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

        {submitting && (
          <p className="mt-5 text-sm text-slate-500" data-testid="submitting-indicator">
            Submitting decision…
          </p>
        )}

        {decision !== null && (
          <div
            className="mt-5 rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-3 text-emerald-900"
            data-testid="decision-status"
          >
            File approved.
          </div>
        )}

        <button
          className="mt-5 w-full rounded bg-emerald-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
          data-testid="approve-button"
          disabled={submitting || decision !== null}
          onClick={approve}
          type="button"
        >
          Approve file
        </button>
      </div>
    </Shell>
  );
}
