import { useState } from 'react';

import { Shell } from '../components/Shell';
import { findLoan } from '../data/loans';

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** `CNF-` followed by 6 characters that are never the same value twice. */
function generateConfirmationCode(): string {
  let suffix = '';
  for (let i = 0; i < 6; i += 1) {
    suffix += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return `CNF-${suffix}`;
}

/**
 * A decision that stamps itself with a value no run will repeat.
 *
 * Real underwriting systems issue a confirmation code and a decision
 * timestamp on every approval, and neither is ever the same twice. A
 * workflow recorded once and asserted against a hard-pinned code or minute
 * would pass exactly once. This fixture exists so extract/assert logic is
 * proved against the *shape* of the value -- `CNF-` plus six characters, an
 * ISO timestamp -- rather than a value copied out of one run's DOM.
 */
export function ReferencePage() {
  const params = new URLSearchParams(window.location.search);
  const loan = findLoan(params.get('loan') ?? '');

  const [confirmation, setConfirmation] = useState<{ code: string; decidedAt: string } | null>(
    null,
  );

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
    setConfirmation({ code: generateConfirmationCode(), decidedAt: new Date().toISOString() });
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

        {confirmation !== null && (
          <div
            className="mt-5 rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-3 text-emerald-900"
            data-testid="decision-status"
          >
            <p>File approved.</p>
            <p className="mt-1 font-mono text-sm">
              Confirmation <span data-testid="confirmation-code">{confirmation.code}</span>
            </p>
            <p className="mt-0.5 font-mono text-xs text-emerald-800">
              Decided <time data-testid="decided-at" dateTime={confirmation.decidedAt}>
                {confirmation.decidedAt}
              </time>
            </p>
          </div>
        )}

        <button
          className="mt-5 w-full rounded bg-emerald-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-50"
          data-testid="approve-button"
          disabled={confirmation !== null}
          onClick={approve}
          type="button"
        >
          Approve file
        </button>
      </div>
    </Shell>
  );
}
