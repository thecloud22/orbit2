import { useEffect, useState } from 'react';

import { Shell } from '../components/Shell';
import { debtToIncome, findLoan, loanToValue } from '../data/loans';

const DEFAULT_EXPIRES_IN_MS = 8_000;

type Decision = 'approved' | 'declined';
type SessionStatus = 'active' | 'expired';

/**
 * A file review that outlives its own session.
 *
 * A fixture, not a rewrite of the underwriting page: it exists to prove one
 * thing -- that a decision submitted after the session has expired is
 * refused with an explicit expired state, rather than committing anyway or
 * hanging, and that one submitted before expiry commits normally. A recorded
 * workflow that runs fast enough takes the happy path; one that runs slower,
 * or is replayed against a shorter `expiresIn`, has to survive the other.
 */
export function SessionExpiryPage() {
  const params = new URLSearchParams(window.location.search);
  const loan = findLoan(params.get('loan') ?? '');
  const expiresInMs = Number(params.get('expiresIn') ?? DEFAULT_EXPIRES_IN_MS);

  const [status, setStatus] = useState<SessionStatus>('active');
  const [decision, setDecision] = useState<Decision | null>(null);
  const [refusedAttempt, setRefusedAttempt] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setStatus('expired'), expiresInMs);
    return () => window.clearTimeout(timer);
  }, [expiresInMs]);

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

  function submit(next: Decision) {
    if (status === 'expired') {
      setRefusedAttempt(true);
      return;
    }
    setDecision(next);
  }

  return (
    <Shell>
      <div className="mx-auto max-w-2xl px-6 py-10">
        <a className="text-xs text-sky-700 hover:underline" href="/pipeline">
          ← Pipeline
        </a>

        <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1
              className="font-mono text-2xl font-semibold text-slate-900"
              data-testid="loan-number"
            >
              {loan.loanNumber}
            </h1>
            <p className="mt-0.5 text-sm text-slate-600" data-testid="borrower-name">
              {loan.borrowerName}
            </p>
          </div>

          <span
            className={`rounded-full border px-3 py-1 text-xs font-semibold tracking-wide uppercase ${
              status === 'active'
                ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                : 'border-rose-300 bg-rose-50 text-rose-800'
            }`}
            data-testid="session-status"
          >
            Session {status}
          </span>
        </div>

        <div className="mt-5 grid grid-cols-3 gap-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div>
            <div className="text-xs tracking-wide text-slate-500 uppercase">Loan-to-value</div>
            <div className="mt-0.5 font-mono text-lg text-slate-900" data-testid="ltv-value">
              {loanToValue(loan).toFixed(2)}%
            </div>
          </div>
          <div>
            <div className="text-xs tracking-wide text-slate-500 uppercase">Debt-to-income</div>
            <div className="mt-0.5 font-mono text-lg text-slate-900" data-testid="dti-value">
              {debtToIncome(loan).toFixed(2)}%
            </div>
          </div>
          <div>
            <div className="text-xs tracking-wide text-slate-500 uppercase">Credit score</div>
            <div
              className="mt-0.5 font-mono text-lg text-slate-900"
              data-testid="credit-score-value"
            >
              {loan.creditScore}
            </div>
          </div>
        </div>

        {decision !== null && (
          <div
            className="mt-5 rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-3 text-emerald-900"
            data-testid="decision-status"
          >
            File {decision}.
          </div>
        )}

        {refusedAttempt && decision === null && (
          <div
            className="mt-5 rounded-lg border border-rose-300 bg-rose-50 px-4 py-3 text-rose-900"
            data-testid="session-expired-banner"
          >
            Your session expired before this decision could be saved.{' '}
            <a className="underline" href="/login">
              Sign in again
            </a>{' '}
            to pick up where this file left off.
          </div>
        )}

        <div className="mt-5 space-y-2">
          <button
            className="w-full rounded bg-emerald-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
            data-testid="approve-button"
            disabled={decision !== null}
            onClick={() => submit('approved')}
            type="button"
          >
            Approve file
          </button>
          <button
            className="w-full rounded border border-rose-400 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-900 transition-colors hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-50"
            data-testid="decline-button"
            disabled={decision !== null}
            onClick={() => submit('declined')}
            type="button"
          >
            Decline file
          </button>
        </div>
      </div>
    </Shell>
  );
}
