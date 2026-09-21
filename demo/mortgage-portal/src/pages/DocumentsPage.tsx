import { useState } from 'react';

import { Shell } from '../components/Shell';
import { findLoan } from '../data/loans';

type DocStatus = 'needed' | 'received' | 'reviewed' | 'cleared';

const STATUS_ORDER: readonly DocStatus[] = ['needed', 'received', 'reviewed', 'cleared'];

const STATUS_LABELS: Readonly<Record<DocStatus, string>> = {
  needed: 'Needed',
  received: 'Received',
  reviewed: 'Reviewed',
  cleared: 'Cleared',
};

const STATUS_TONES: Readonly<Record<DocStatus, string>> = {
  needed: 'border-slate-300 bg-slate-100 text-slate-700',
  received: 'border-sky-300 bg-sky-50 text-sky-800',
  reviewed: 'border-amber-300 bg-amber-50 text-amber-800',
  cleared: 'border-emerald-300 bg-emerald-50 text-emerald-800',
};

interface Stipulation {
  readonly id: string;
  readonly label: string;
  readonly required: boolean;
}

const STIPULATIONS: readonly Stipulation[] = [
  { id: 'pay-stubs', label: 'Most recent 30 days of pay stubs', required: true },
  { id: 'tax-returns', label: 'Two years of signed personal tax returns', required: true },
  { id: 'bank-statements', label: 'Two months of bank statements, all pages', required: true },
  { id: 'appraisal', label: 'Appraisal report', required: true },
  { id: 'insurance-binder', label: "Homeowner's insurance binder", required: true },
  { id: 'gift-letter', label: 'Gift letter for down payment funds', required: false },
];

function advance(status: DocStatus): DocStatus {
  const index = STATUS_ORDER.indexOf(status);
  return STATUS_ORDER[Math.min(index + 1, STATUS_ORDER.length - 1)] ?? status;
}

/**
 * The stipulation list a file can't close without.
 *
 * Every item here is required to reach `cleared` except the gift letter,
 * which only applies if the borrower needs it -- so "every item cleared" and
 * "every required item cleared" are deliberately different conditions, and
 * only the second one gates the approve button. Each row advances through
 * the same four states a real processor's checklist does; there is no way to
 * skip from `needed` straight to `cleared`; a workflow has to drive each row
 * forward exactly as many times as it takes.
 */
export function DocumentsPage() {
  const params = new URLSearchParams(window.location.search);
  const loan = findLoan(params.get('loan') ?? '');

  const [statuses, setStatuses] = useState<Record<string, DocStatus>>(() =>
    Object.fromEntries(STIPULATIONS.map((doc) => [doc.id, 'needed' as DocStatus])),
  );
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

  const ready = STIPULATIONS.filter((doc) => doc.required).every(
    (doc) => statuses[doc.id] === 'cleared',
  );

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

        <div className="mt-5 rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-4 py-2.5">
            <h2 className="text-sm font-semibold text-slate-900">Stipulations</h2>
          </div>
          <ul className="divide-y divide-slate-100">
            {STIPULATIONS.map((doc) => {
              const status = statuses[doc.id] ?? 'needed';
              return (
                <li
                  className="flex items-center justify-between gap-3 px-4 py-3"
                  data-testid={`stip-${doc.id}`}
                  key={doc.id}
                >
                  <div>
                    <div className="text-sm text-slate-800">{doc.label}</div>
                    <div className="text-xs text-slate-500">
                      {doc.required ? 'Required' : 'Conditional'}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`rounded-full border px-2.5 py-1 text-xs font-medium ${STATUS_TONES[status]}`}
                      data-testid={`stip-status-${doc.id}`}
                    >
                      {STATUS_LABELS[status]}
                    </span>
                    <button
                      className="rounded border border-slate-300 px-2.5 py-1 text-xs text-slate-700 transition-colors hover:border-sky-400 hover:bg-sky-50 disabled:cursor-not-allowed disabled:opacity-40"
                      data-testid={`advance-doc-${doc.id}`}
                      disabled={status === 'cleared'}
                      onClick={() =>
                        setStatuses((current) => ({
                          ...current,
                          [doc.id]: advance(current[doc.id] ?? 'needed'),
                        }))
                      }
                      type="button"
                    >
                      Advance
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>

        <div
          className={`mt-5 rounded-lg border px-4 py-3 text-sm ${
            ready
              ? 'border-emerald-300 bg-emerald-50 text-emerald-900'
              : 'border-slate-300 bg-slate-100 text-slate-600'
          }`}
          data-testid="documents-ready-banner"
        >
          {ready
            ? 'All required stipulations are cleared. This file is ready to close.'
            : 'Required stipulations are still outstanding.'}
        </div>

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
          disabled={!ready || decision !== null}
          onClick={() => setDecision('approved')}
          type="button"
        >
          Approve file
        </button>
      </div>
    </Shell>
  );
}
