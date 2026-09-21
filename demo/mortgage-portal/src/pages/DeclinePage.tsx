import { useState } from 'react';

import { Shell } from '../components/Shell';
import { findLoan } from '../data/loans';

interface DeclineReason {
  readonly id: string;
  readonly label: string;
}

/** The codes an adverse-action notice actually cites, not a free-text box. */
const DECLINE_REASONS: readonly DeclineReason[] = [
  { id: 'credit-score', label: 'Credit score below program minimum' },
  { id: 'debt-to-income', label: 'Debt-to-income ratio too high' },
  { id: 'insufficient-income', label: 'Insufficient income for amount requested' },
  { id: 'insufficient-collateral', label: 'Value or type of collateral not sufficient' },
  { id: 'incomplete-application', label: 'Incomplete application, information not provided' },
  { id: 'length-of-employment', label: 'Length of employment' },
];

/**
 * The core file review's decline button commits in a single click -- that's
 * the behavior an existing recorded workflow already depends on, so this
 * doesn't change it. What real ECOA adverse-action practice adds is a
 * required reason: a lender declining credit has to cite at least one of a
 * fixed set of codes, not decline silently. This page is that stricter
 * decline, kept off the file's own decision panel so nothing already built
 * against it breaks.
 */
export function DeclinePage() {
  const params = new URLSearchParams(window.location.search);
  const loan = findLoan(params.get('loan') ?? '');

  const [selected, setSelected] = useState<readonly string[]>([]);
  const [declined, setDeclined] = useState(false);
  const [attempted, setAttempted] = useState(false);

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

  function toggle(id: string) {
    setSelected((current) =>
      current.includes(id) ? current.filter((one) => one !== id) : [...current, id],
    );
  }

  function decline() {
    if (selected.length === 0) {
      setAttempted(true);
      return;
    }
    setDeclined(true);
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

        {declined ? (
          <div
            className="mt-5 rounded-lg border border-rose-300 bg-rose-50 px-4 py-3 text-rose-900"
            data-testid="decision-status"
          >
            <p className="font-medium">File declined.</p>
            <ul className="mt-2 list-inside list-disc text-sm" data-testid="decline-reason-list">
              {selected.map((id) => (
                <li key={id}>{DECLINE_REASONS.find((reason) => reason.id === id)?.label}</li>
              ))}
            </ul>
          </div>
        ) : (
          <>
            <div className="mt-5 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <div className="text-xs font-semibold tracking-wide text-slate-500 uppercase">
                Reasons for adverse action (select at least one)
              </div>
              <div className="mt-3 space-y-2">
                {DECLINE_REASONS.map((reason) => (
                  <label
                    className="flex items-center gap-2 text-sm text-slate-700"
                    key={reason.id}
                  >
                    <input
                      checked={selected.includes(reason.id)}
                      data-testid={`decline-reason-${reason.id}`}
                      onChange={() => toggle(reason.id)}
                      type="checkbox"
                    />
                    {reason.label}
                  </label>
                ))}
              </div>
            </div>

            {attempted && selected.length === 0 && (
              <p className="mt-3 text-sm text-rose-700" data-testid="decline-reason-required">
                Select at least one reason before declining.
              </p>
            )}

            <button
              className="mt-5 w-full rounded border border-rose-400 bg-rose-50 px-3 py-2 text-sm font-medium text-rose-900 transition-colors hover:bg-rose-100"
              data-testid="decline-button"
              onClick={decline}
              type="button"
            >
              Decline file
            </button>
          </>
        )}
      </div>
    </Shell>
  );
}
