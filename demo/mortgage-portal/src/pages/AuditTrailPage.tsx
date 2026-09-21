import { useState } from 'react';

import { Shell } from '../components/Shell';
import { appendAuditEntry, getAuditTrail, type AuditEntry } from '../data/auditLog';
import { findLoan, type Loan } from '../data/loans';

/** A few plausible historical entries, generated from the file's own dates. */
function seedHistory(loan: Loan): readonly AuditEntry[] {
  return [
    { at: `${loan.submittedOn}T09:14:00.000Z`, actor: loan.borrowerName, action: 'Application submitted' },
    { at: `${loan.submittedOn}T11:02:00.000Z`, actor: 'System', action: `Assigned to ${loan.underwriter}` },
    {
      at: `${loan.submittedOn}T15:47:00.000Z`,
      actor: loan.underwriter,
      action: 'Automated underwriting run requested',
    },
  ];
}

/**
 * A per-file timeline, appended to but never rewritten.
 *
 * Most of what's shown is seeded from the file's own submitted date, so
 * revisiting the page shows the same history rather than a fresh random one.
 * What's genuinely append-only is the log below it: entries persist for the
 * session, in the order they were written, with no way to edit or remove one
 * once it's there -- the property this page exists to demonstrate.
 */
export function AuditTrailPage() {
  const params = new URLSearchParams(window.location.search);
  const loan = findLoan(params.get('loan') ?? '');
  const [note, setNote] = useState('');
  const [, forceRender] = useState(0);

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

  const entries = [...seedHistory(loan), ...getAuditTrail(loan.loanNumber)];

  function logNote() {
    if (note.trim() === '' || loan === undefined) {
      return;
    }
    appendAuditEntry(loan.loanNumber, 'You', note.trim());
    setNote('');
    forceRender((count) => count + 1);
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

        <ol className="mt-5 space-y-2" data-testid="audit-trail">
          {entries.map((entry, index) => (
            <li
              className="rounded border border-slate-200 bg-white px-3 py-2 text-sm"
              data-testid={`audit-entry-${index}`}
              key={`${entry.at}-${index}`}
            >
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-slate-900">{entry.action}</span>
                <time className="shrink-0 font-mono text-xs text-slate-500" dateTime={entry.at}>
                  {entry.at}
                </time>
              </div>
              <div className="text-xs text-slate-500">{entry.actor}</div>
            </li>
          ))}
        </ol>

        <div className="mt-5 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <label
            className="block text-xs font-semibold tracking-wide text-slate-500 uppercase"
            htmlFor="audit-note-input"
          >
            Log an entry
          </label>
          <div className="mt-2 flex flex-wrap gap-2">
            <input
              className="w-64 flex-1 rounded border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:ring-1 focus:ring-sky-500 focus:outline-none"
              data-testid="audit-note-input"
              id="audit-note-input"
              onChange={(event) => setNote(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  logNote();
                }
              }}
              value={note}
            />
            <button
              className="rounded bg-sky-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-sky-500"
              data-testid="audit-note-submit"
              onClick={logNote}
              type="button"
            >
              Log
            </button>
          </div>
        </div>
      </div>
    </Shell>
  );
}
