import { useEffect, useState } from 'react';

import { FileNav } from '../components/FileNav';
import { Shell } from '../components/Shell';
import { findLoan, type LoanProgram } from '../data/loans';

interface RateOption {
  readonly id: string;
  readonly program: LoanProgram;
  readonly termYears: number;
  readonly rate: number;
  readonly points: number;
}

const RATE_SHEET: readonly RateOption[] = [
  { id: 'conv-30-0', program: 'conventional', termYears: 30, rate: 6.375, points: 0 },
  { id: 'conv-30-1', program: 'conventional', termYears: 30, rate: 6.125, points: 1 },
  { id: 'conv-15-0', program: 'conventional', termYears: 15, rate: 5.75, points: 0 },
  { id: 'fha-30-0', program: 'fha', termYears: 30, rate: 6.25, points: 0 },
  { id: 'va-30-0', program: 'va', termYears: 30, rate: 6.125, points: 0 },
  { id: 'jumbo-30-0', program: 'jumbo', termYears: 30, rate: 6.75, points: 0 },
];

const DEFAULT_LOCK_SECONDS = 60;

/** Monthly principal & interest on a fully-amortizing fixed-rate loan. */
function monthlyPI(principal: number, annualRatePercent: number, termYears: number): number {
  const monthlyRate = annualRatePercent / 100 / 12;
  const payments = termYears * 12;
  if (monthlyRate === 0) {
    return principal / payments;
  }
  const factor = (1 + monthlyRate) ** payments;
  return (principal * monthlyRate * factor) / (factor - 1);
}

type LockStatus = 'unlocked' | 'locked' | 'expired';

/**
 * A rate lock that can expire out from under a decision, same mechanism as
 * `/underwriting/session-expiry`, different domain: here it's the *price*
 * that stops being valid, not the session. `?lockSeconds=` shortens the
 * window for a fast test; the P&I figure is a real amortization calculation
 * against the file's own loan amount, not a stub number.
 */
export function PricingPage() {
  const params = new URLSearchParams(window.location.search);
  const loan = findLoan(params.get('loan') ?? '');
  const lockSeconds = Number(params.get('lockSeconds') ?? DEFAULT_LOCK_SECONDS);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [status, setStatus] = useState<LockStatus>('unlocked');
  const [secondsLeft, setSecondsLeft] = useState(lockSeconds);

  useEffect(() => {
    if (status !== 'locked') {
      return;
    }
    if (secondsLeft <= 0) {
      setStatus('expired');
      return;
    }
    const timer = window.setTimeout(() => setSecondsLeft((current) => current - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [status, secondsLeft]);

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

  const options = RATE_SHEET.filter((option) => option.program === loan.program);
  const selected = options.find((option) => option.id === selectedId) ?? null;

  function lock() {
    if (selected === null) {
      return;
    }
    setSecondsLeft(lockSeconds);
    setStatus('locked');
  }

  function relock() {
    setSecondsLeft(lockSeconds);
    setStatus('locked');
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
        <p className="mt-0.5 text-sm text-slate-600">
          Loan amount <span className="font-mono">${loan.loanAmount.toLocaleString('en-US')}</span>
        </p>

        <FileNav current="pricing" loanNumber={loan.loanNumber} />

        <div className="mt-5 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-left text-sm" data-testid="rate-sheet">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs tracking-wide text-slate-500 uppercase">
              <tr>
                <th className="px-4 py-2 font-semibold">Term</th>
                <th className="px-4 py-2 text-right font-semibold">Rate</th>
                <th className="px-4 py-2 text-right font-semibold">Points</th>
                <th className="px-4 py-2 text-right font-semibold">Est. P&I</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {options.map((option) => (
                <tr key={option.id}>
                  <td className="px-4 py-2.5 text-slate-800">{option.termYears}-yr fixed</td>
                  <td className="px-4 py-2.5 text-right font-mono text-slate-800">{option.rate}%</td>
                  <td className="px-4 py-2.5 text-right font-mono text-slate-800">{option.points}</td>
                  <td className="px-4 py-2.5 text-right font-mono text-slate-800">
                    $
                    {monthlyPI(loan.loanAmount, option.rate, option.termYears).toLocaleString('en-US', {
                      maximumFractionDigits: 0,
                    })}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <label className="inline-flex items-center gap-2 text-xs text-slate-600">
                      <input
                        checked={selectedId === option.id}
                        data-testid={`rate-option-${option.id}`}
                        disabled={status === 'locked'}
                        name="rate-option"
                        onChange={() => setSelectedId(option.id)}
                        type="radio"
                      />
                      Select
                    </label>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {status === 'unlocked' && (
          <button
            className="mt-5 w-full rounded bg-sky-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-50"
            data-testid="lock-rate-button"
            disabled={selected === null}
            onClick={lock}
            type="button"
          >
            Lock rate
          </button>
        )}

        {status === 'locked' && selected !== null && (
          <div
            className="mt-5 rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-3 text-emerald-900"
            data-testid="lock-status"
          >
            <p>
              Locked at <span className="font-mono">{selected.rate}%</span>, {selected.termYears}-yr,{' '}
              {selected.points} points.
            </p>
            <p className="mt-1 text-xs">
              Expires in{' '}
              <span className="font-mono" data-testid="lock-seconds-left">
                {secondsLeft}
              </span>
              s
            </p>
          </div>
        )}

        {status === 'expired' && (
          <div
            className="mt-5 rounded-lg border border-rose-300 bg-rose-50 px-4 py-3 text-rose-900"
            data-testid="lock-status"
          >
            <p>The rate lock has expired.</p>
            <button
              className="mt-2 rounded border border-rose-400 bg-white px-3 py-1.5 text-xs font-medium text-rose-800 hover:bg-rose-50"
              data-testid="relock-button"
              onClick={relock}
              type="button"
            >
              Re-lock at current pricing
            </button>
          </div>
        )}
      </div>
    </Shell>
  );
}
