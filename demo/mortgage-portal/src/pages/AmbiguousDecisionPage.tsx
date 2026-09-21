import { useState } from 'react';

import { Shell } from '../components/Shell';
import { findLoan } from '../data/loans';

/**
 * Two buttons named "Approve", nowhere near each other.
 *
 * Both carry the same visible text and the same accessible name -- no
 * `aria-label` on either breaks the tie -- because the property under test is
 * whether a locator resolves the *right* one from context, not whether the
 * two can be told apart at all. A quick-actions toolbar mirrors a real LOS
 * convenience shortcut; the file-decision panel is the actual decision of
 * record. `data-testid` differs between them for this portal's own suite
 * only, the same way it does everywhere else in `demo/` -- the binder itself
 * never reads it, so what it has to resolve on is which "Approve" sits under
 * which heading.
 */
export function AmbiguousDecisionPage() {
  const params = new URLSearchParams(window.location.search);
  const loan = findLoan(params.get('loan') ?? '');

  const [decision, setDecision] = useState<'approved' | null>(null);
  const [source, setSource] = useState<'quick-actions' | 'file-decision' | null>(null);

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

  function approve(from: 'quick-actions' | 'file-decision') {
    setDecision('approved');
    setSource(from);
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

        <div className="mt-5 flex items-center justify-between rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm">
          <span className="text-sm font-semibold text-slate-900">Quick actions</span>
          <button
            className="rounded border border-slate-300 px-3 py-1.5 text-sm text-slate-700 transition-colors hover:border-sky-400 hover:bg-sky-50"
            data-testid="quick-approve-button"
            onClick={() => approve('quick-actions')}
            type="button"
          >
            Approve
          </button>
        </div>

        <div className="mt-5 rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-4 py-2.5">
            <h2 className="text-sm font-semibold text-slate-900">File decision</h2>
          </div>
          <div className="px-4 py-4">
            <p className="text-sm text-slate-600">
              Record the underwriter&apos;s decision of record for this file.
            </p>
            <button
              className="mt-3 rounded bg-emerald-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-500"
              data-testid="panel-approve-button"
              onClick={() => approve('file-decision')}
              type="button"
            >
              Approve
            </button>
          </div>
        </div>

        {decision !== null && (
          <div
            className="mt-5 rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-3 text-emerald-900"
            data-testid="decision-status"
          >
            File approved.{' '}
            <span className="font-mono text-xs" data-testid="decision-source">
              via {source}
            </span>
          </div>
        )}
      </div>
    </Shell>
  );
}
