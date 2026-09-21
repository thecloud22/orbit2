import { useState } from 'react';

import { FileNav } from '../components/FileNav';
import { Shell } from '../components/Shell';
import {
  CONFORMING_LIMIT,
  debtToIncome,
  findLoan,
  isSpecialFloodHazardArea,
  loanToValue,
  PROGRAM_MIN_CREDIT_SCORE,
  type Loan,
} from '../data/loans';

type Recommendation = 'approve_eligible' | 'refer' | 'ineligible';

const RECOMMENDATION_LABELS: Readonly<Record<Recommendation, string>> = {
  approve_eligible: 'Approve/Eligible',
  refer: 'Refer',
  ineligible: 'Ineligible',
};

const RECOMMENDATION_TONES: Readonly<Record<Recommendation, string>> = {
  approve_eligible: 'border-emerald-300 bg-emerald-50 text-emerald-900',
  refer: 'border-amber-300 bg-amber-50 text-amber-900',
  ineligible: 'border-rose-300 bg-rose-50 text-rose-900',
};

interface Finding {
  readonly id: string;
  readonly severity: 'block' | 'refer' | 'info';
  readonly text: string;
}

/**
 * What an automated underwriting run actually is: a fixed set of thresholds
 * read off figures the screen already shows, producing the same
 * recommendation every time for the same file. Deliberately not flaky and
 * not random -- a real DU/LP run is reproducible, and a workflow that
 * re-runs it on the same file mid-recording has to see the same answer,
 * unlike `/underwriting/flaky`'s decision button.
 */
function evaluate(loan: Loan): { recommendation: Recommendation; findings: Finding[] } {
  const ltv = loanToValue(loan);
  const dti = debtToIncome(loan);
  const minCredit = PROGRAM_MIN_CREDIT_SCORE[loan.program];
  const findings: Finding[] = [];

  if (loan.creditScore < minCredit) {
    findings.push({
      id: 'credit-floor',
      severity: 'block',
      text: `Credit score ${loan.creditScore} is below the ${minCredit} floor for this program.`,
    });
  } else if (loan.creditScore < minCredit + 20) {
    findings.push({
      id: 'credit-margin',
      severity: 'refer',
      text: `Credit score ${loan.creditScore} clears the floor by fewer than 20 points.`,
    });
  }

  if (ltv > 97) {
    findings.push({
      id: 'ltv-block',
      severity: 'block',
      text: `Loan-to-value ${ltv.toFixed(2)}% exceeds the 97% program maximum.`,
    });
  } else if (ltv > 90) {
    findings.push({
      id: 'ltv-refer',
      severity: 'refer',
      text: `Loan-to-value ${ltv.toFixed(2)}% is above 90%.`,
    });
  }

  if (dti > 50) {
    findings.push({
      id: 'ability-to-repay',
      severity: 'block',
      text: `Debt-to-income ${dti.toFixed(2)}% exceeds the 50% ability-to-repay maximum.`,
    });
  } else if (dti > 43) {
    findings.push({
      id: 'dti-refer',
      severity: 'refer',
      text: `Debt-to-income ${dti.toFixed(2)}% exceeds the 43% qualified-mortgage guideline.`,
    });
  }

  if (ltv > 80) {
    findings.push({
      id: 'pmi-required',
      severity: 'info',
      text: `Loan-to-value ${ltv.toFixed(2)}% is over 80% -- private mortgage insurance is required until equity reaches 78%.`,
    });
  }

  if (loan.program !== 'jumbo' && loan.loanAmount > CONFORMING_LIMIT) {
    findings.push({
      id: 'conforming-limit',
      severity: 'block',
      text: `Loan amount exceeds the conforming limit ($${CONFORMING_LIMIT.toLocaleString('en-US')}) for a non-jumbo program.`,
    });
  }

  if (isSpecialFloodHazardArea(loan.floodZone)) {
    findings.push({
      id: 'flood-zone',
      severity: 'refer',
      text: `Property is in flood zone ${loan.floodZone}, a Special Flood Hazard Area -- flood insurance required.`,
    });
  }

  const recommendation: Recommendation = findings.some((finding) => finding.severity === 'block')
    ? 'ineligible'
    : findings.some((finding) => finding.severity === 'refer')
      ? 'refer'
      : 'approve_eligible';

  return { recommendation, findings };
}

export function AutomatedUnderwritingPage() {
  const params = new URLSearchParams(window.location.search);
  const loan = findLoan(params.get('loan') ?? '');

  const [result, setResult] = useState<{ recommendation: Recommendation; findings: Finding[] } | null>(
    null,
  );
  const [running, setRunning] = useState(false);

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

  function run() {
    setRunning(true);
    window.setTimeout(() => {
      setResult(evaluate(loan as Loan));
      setRunning(false);
    }, 600);
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

        <FileNav current="automated-underwriting" loanNumber={loan.loanNumber} />

        <button
          className="mt-5 rounded bg-sky-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-sky-500 disabled:cursor-not-allowed disabled:opacity-50"
          data-testid="run-automated-underwriting-button"
          disabled={running}
          onClick={run}
          type="button"
        >
          Run automated underwriting
        </button>

        {running && (
          <p className="mt-4 text-sm text-slate-500" data-testid="automated-underwriting-processing">
            Submitting to automated underwriting…
          </p>
        )}

        {result !== null && (
          <div className="mt-5">
            <div
              className={`rounded-lg border px-4 py-3 ${RECOMMENDATION_TONES[result.recommendation]}`}
              data-testid="automated-underwriting-recommendation"
            >
              <div className="text-xs font-semibold tracking-wide uppercase opacity-70">
                Automated underwriting recommendation
              </div>
              <div className="mt-0.5 text-lg font-semibold">
                {RECOMMENDATION_LABELS[result.recommendation]}
              </div>
            </div>

            {result.findings.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500" data-testid="automated-underwriting-findings-empty">
                No findings. The file clears every automated threshold.
              </p>
            ) : (
              <ul className="mt-3 space-y-2" data-testid="automated-underwriting-findings">
                {result.findings.map((finding) => (
                  <li
                    className={`rounded border px-3 py-2 text-sm ${
                      finding.severity === 'block'
                        ? 'border-rose-200 bg-rose-50 text-rose-900'
                        : finding.severity === 'refer'
                          ? 'border-amber-200 bg-amber-50 text-amber-900'
                          : 'border-sky-200 bg-sky-50 text-sky-900'
                    }`}
                    data-testid={`automated-underwriting-finding-${finding.id}`}
                    key={finding.id}
                  >
                    {finding.text}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </Shell>
  );
}
