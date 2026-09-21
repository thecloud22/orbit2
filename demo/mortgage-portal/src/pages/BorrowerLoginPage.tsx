import { useState } from 'react';

import { PORTAL_NAME } from '../app/app-info';

/**
 * A second front door, for a second role.
 *
 * The underwriter sign-on at `/login` leads to the pipeline -- every file,
 * every internal figure. A borrower isn't the same person looking at a
 * smaller version of that screen; they're a different role with a
 * genuinely narrower view, and that starts with a separate sign-on rather
 * than a checkbox on the same one. Dummy like the underwriter login: loan
 * number, user ID, and password are all required, and any values work.
 */
export function BorrowerLoginPage() {
  const [loanNumber, setLoanNumber] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    window.location.href = `/borrower?loan=${encodeURIComponent(loanNumber.trim())}`;
  }

  return (
    <div className="flex min-h-screen flex-col bg-slate-100">
      <div className="bg-emerald-500/90 px-6 py-1 text-center text-[11px] font-semibold tracking-widest text-emerald-950">
        BORROWER PORTAL · TRAINING INSTANCE
      </div>

      <div className="flex flex-1 items-center justify-center px-6 py-16">
        <div className="w-full max-w-sm">
          <div className="mb-6 flex flex-col items-center gap-3 text-center">
            <span className="flex h-10 w-10 items-center justify-center rounded bg-emerald-600 text-base font-bold text-white">
              M
            </span>
            <span>
              <span className="block text-sm font-semibold text-slate-900">{PORTAL_NAME}</span>
              <span className="block text-[11px] tracking-wide text-slate-500">
                Borrower portal
              </span>
            </span>
          </div>

          <form
            className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm"
            data-testid="borrower-login-form"
            onSubmit={submit}
          >
            <h1 className="text-sm font-semibold text-slate-900">Sign in to your loan</h1>

            <div className="mt-4">
              <label
                className="block text-xs font-semibold tracking-wide text-slate-500 uppercase"
                htmlFor="borrower-loan-number"
              >
                Loan number
              </label>
              <input
                className="mt-1.5 w-full rounded border border-slate-300 px-3 py-2 font-mono text-sm focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                data-testid="borrower-loan-number-input"
                id="borrower-loan-number"
                onChange={(event) => setLoanNumber(event.target.value)}
                placeholder="ML-26-04471"
                required
                type="text"
                value={loanNumber}
              />
            </div>

            <div className="mt-4">
              <label
                className="block text-xs font-semibold tracking-wide text-slate-500 uppercase"
                htmlFor="borrower-username"
              >
                User ID
              </label>
              <input
                autoComplete="username"
                className="mt-1.5 w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                data-testid="borrower-username-input"
                id="borrower-username"
                onChange={(event) => setUsername(event.target.value)}
                required
                type="text"
                value={username}
              />
            </div>

            <div className="mt-4">
              <label
                className="block text-xs font-semibold tracking-wide text-slate-500 uppercase"
                htmlFor="borrower-password"
              >
                Password
              </label>
              <input
                autoComplete="current-password"
                className="mt-1.5 w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 focus:outline-none"
                data-testid="borrower-password-input"
                id="borrower-password"
                onChange={(event) => setPassword(event.target.value)}
                required
                type="password"
                value={password}
              />
            </div>

            <button
              className="mt-6 w-full rounded bg-emerald-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-500"
              data-testid="borrower-login-submit-button"
              type="submit"
            >
              Sign in
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
