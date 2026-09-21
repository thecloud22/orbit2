import { useState } from 'react';

import { Shell } from '../components/Shell';
import {
  debtToIncome,
  LOANS,
  loanToValue,
  PROGRAM_LABELS,
  STATUS_LABELS,
  type LoanProgram,
  type LoanStatus,
} from '../data/loans';

type SortKey = 'submittedOn' | 'ltv' | 'dti' | 'creditScore';

const UNDERWRITERS = [...new Set(LOANS.map((loan) => loan.underwriter))].sort();
const STATUSES = [...new Set(LOANS.map((loan) => loan.status))] as readonly LoanStatus[];
const PROGRAMS = [...new Set(LOANS.map((loan) => loan.program))] as readonly LoanProgram[];

/**
 * The pipeline table filtered and sorted, kept off `/pipeline` itself so the
 * existing lookup-by-loan-number flow there is untouched. Filtering by
 * underwriter, status, and program composes with a numeric sort (LTV, DTI,
 * credit score, submitted date) rather than each replacing the last, which
 * is where a naive "one filter at a time" implementation usually breaks.
 */
export function PipelineBrowsePage() {
  const [underwriter, setUnderwriter] = useState('');
  const [status, setStatus] = useState('');
  const [program, setProgram] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('submittedOn');

  const filtered = LOANS.filter((loan) => underwriter === '' || loan.underwriter === underwriter)
    .filter((loan) => status === '' || loan.status === status)
    .filter((loan) => program === '' || loan.program === program);

  const sorted = [...filtered].sort((a, b) => {
    if (sortKey === 'submittedOn') {
      return a.submittedOn.localeCompare(b.submittedOn);
    }
    if (sortKey === 'ltv') {
      return loanToValue(a) - loanToValue(b);
    }
    if (sortKey === 'dti') {
      return debtToIncome(a) - debtToIncome(b);
    }
    return a.creditScore - b.creditScore;
  });

  return (
    <Shell current="/pipeline">
      <div className="mx-auto max-w-6xl px-6 py-8">
        <h1 className="text-xl font-semibold text-slate-900">Pipeline, filtered</h1>
        <p className="mt-1 text-sm text-slate-600" data-testid="result-count">
          {sorted.length} of {LOANS.length} files
        </p>

        <div className="mt-4 flex flex-wrap gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <FilterSelect
            label="Underwriter"
            onChange={setUnderwriter}
            options={UNDERWRITERS}
            testId="filter-underwriter"
            value={underwriter}
          />
          <FilterSelect
            label="Status"
            labels={STATUS_LABELS}
            onChange={setStatus}
            options={STATUSES}
            testId="filter-status"
            value={status}
          />
          <FilterSelect
            label="Program"
            labels={PROGRAM_LABELS}
            onChange={setProgram}
            options={PROGRAMS}
            testId="filter-program"
            value={program}
          />
          <label className="block text-sm text-slate-700">
            <span className="block text-xs font-semibold tracking-wide text-slate-500 uppercase">
              Sort by
            </span>
            <select
              className="mt-1.5 rounded border border-slate-300 px-3 py-2 text-sm"
              data-testid="sort-key"
              onChange={(event) => setSortKey(event.target.value as SortKey)}
              value={sortKey}
            >
              <option value="submittedOn">Submitted date</option>
              <option value="ltv">Loan-to-value</option>
              <option value="dti">Debt-to-income</option>
              <option value="creditScore">Credit score</option>
            </select>
          </label>
        </div>

        <div className="mt-4 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          {sorted.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-slate-500" data-testid="no-results">
              No files match these filters.
            </p>
          ) : (
            <table className="w-full text-left text-sm" data-testid="pipeline-table">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs tracking-wide text-slate-500 uppercase">
                <tr>
                  <th className="px-4 py-2 font-semibold">Loan number</th>
                  <th className="px-4 py-2 font-semibold">Underwriter</th>
                  <th className="px-4 py-2 font-semibold">Program</th>
                  <th className="px-4 py-2 font-semibold">Status</th>
                  <th className="px-4 py-2 text-right font-semibold">LTV</th>
                  <th className="px-4 py-2 text-right font-semibold">DTI</th>
                  <th className="px-4 py-2 text-right font-semibold">FICO</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {sorted.map((loan) => (
                  <tr key={loan.loanNumber}>
                    <td className="px-4 py-2.5">
                      <a
                        className="font-mono text-sky-700 hover:underline"
                        href={`/underwriting?loan=${encodeURIComponent(loan.loanNumber)}`}
                      >
                        {loan.loanNumber}
                      </a>
                    </td>
                    <td className="px-4 py-2.5 text-slate-800">{loan.underwriter}</td>
                    <td className="px-4 py-2.5 text-slate-600">{PROGRAM_LABELS[loan.program]}</td>
                    <td className="px-4 py-2.5 text-slate-600">{STATUS_LABELS[loan.status]}</td>
                    <td className="px-4 py-2.5 text-right font-mono text-slate-800">
                      {loanToValue(loan).toFixed(2)}%
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-slate-800">
                      {debtToIncome(loan).toFixed(2)}%
                    </td>
                    <td className="px-4 py-2.5 text-right font-mono text-slate-800">
                      {loan.creditScore}
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

function FilterSelect<T extends string>({
  label,
  options,
  labels,
  value,
  onChange,
  testId,
}: {
  label: string;
  options: readonly T[];
  labels?: Readonly<Record<T, string>>;
  value: string;
  onChange: (value: string) => void;
  testId: string;
}) {
  return (
    <label className="block text-sm text-slate-700">
      <span className="block text-xs font-semibold tracking-wide text-slate-500 uppercase">
        {label}
      </span>
      <select
        className="mt-1.5 rounded border border-slate-300 px-3 py-2 text-sm"
        data-testid={testId}
        onChange={(event) => onChange(event.target.value)}
        value={value}
      >
        <option value="">All</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {labels ? labels[option] : option}
          </option>
        ))}
      </select>
    </label>
  );
}
