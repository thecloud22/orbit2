import { Shell } from '../components/Shell';
import { LOANS, PROGRAM_LABELS, debtToIncome, loanToValue } from '../data/loans';

type ListState = 'loading' | 'error' | 'empty' | 'no-match' | 'loaded';

const STATES: readonly { value: ListState; label: string }[] = [
  { value: 'loading', label: 'Loading' },
  { value: 'error', label: 'Could not load' },
  { value: 'empty', label: 'Nothing yet' },
  { value: 'no-match', label: 'Nothing matching' },
  { value: 'loaded', label: 'Loaded' },
];

/**
 * One route, the five things an empty-looking list can actually mean.
 *
 * `docs/slice-1-brief.md`'s acceptance criteria call out four states a list
 * step has to tell apart: nothing yet, nothing matching a filter, not loaded,
 * and could not load. A table with zero rows looks identical in all four
 * cases unless the page says which one it is -- so this fixture renders each
 * with its own copy and its own `data-testid`, switchable by `?state=`,
 * rather than leaving a workflow to infer the reason from an empty `<tbody>`.
 */
export function PipelineStatesPage() {
  const params = new URLSearchParams(window.location.search);
  const state = (params.get('state') as ListState | null) ?? 'loaded';

  return (
    <Shell current="/pipeline">
      <div className="mx-auto max-w-6xl px-6 py-8">
        <h1 className="text-xl font-semibold text-slate-900">Underwriting pipeline</h1>

        <nav className="mt-3 flex flex-wrap gap-2" data-testid="state-switcher">
          {STATES.map((option) => (
            <a
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                option.value === state
                  ? 'border-sky-400 bg-sky-50 text-sky-800'
                  : 'border-slate-300 text-slate-600 hover:bg-slate-50'
              }`}
              data-testid={`state-link-${option.value}`}
              href={`/pipeline/states?state=${option.value}`}
              key={option.value}
            >
              {option.label}
            </a>
          ))}
        </nav>

        <div className="mt-6 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          {state === 'loading' && (
            <p className="px-4 py-10 text-center text-sm text-slate-500" data-testid="pipeline-loading">
              Loading pipeline…
            </p>
          )}

          {state === 'error' && (
            <div className="px-4 py-10 text-center" data-testid="pipeline-error">
              <p className="text-sm text-rose-700">Could not load the pipeline.</p>
              <a
                className="mt-3 inline-block rounded bg-sky-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-500"
                data-testid="pipeline-retry-button"
                href="/pipeline/states?state=loaded"
              >
                Retry
              </a>
            </div>
          )}

          {state === 'empty' && (
            <p className="px-4 py-10 text-center text-sm text-slate-500" data-testid="pipeline-empty">
              No files in the pipeline yet.
            </p>
          )}

          {state === 'no-match' && (
            <div className="px-4 py-10 text-center" data-testid="pipeline-no-match">
              <p className="text-sm text-slate-500">
                No files match <span className="font-mono">&quot;ML-26-90000&quot;</span>.
              </p>
            </div>
          )}

          {state === 'loaded' && (
            <table className="w-full text-left text-sm" data-testid="pipeline-table">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs tracking-wide text-slate-500 uppercase">
                <tr>
                  <th className="px-4 py-2 font-semibold">Loan number</th>
                  <th className="px-4 py-2 font-semibold">Borrower</th>
                  <th className="px-4 py-2 font-semibold">Program</th>
                  <th className="px-4 py-2 text-right font-semibold">LTV</th>
                  <th className="px-4 py-2 text-right font-semibold">DTI</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {LOANS.map((loan) => (
                  <tr key={loan.loanNumber}>
                    <td className="px-4 py-2.5 font-mono text-sky-700">{loan.loanNumber}</td>
                    <td className="px-4 py-2.5 text-slate-800">{loan.borrowerName}</td>
                    <td className="px-4 py-2.5 text-slate-600">{PROGRAM_LABELS[loan.program]}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-slate-800">
                      {loanToValue(loan).toFixed(2)}%
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-slate-800">
                      {debtToIncome(loan).toFixed(2)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </Shell>
  );
}
