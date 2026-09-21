import { useState } from 'react';

import { PORTAL_ENVIRONMENT, PORTAL_NAME, PORTAL_SUBTITLE } from '../app/app-info';

/**
 * Sign-on, ahead of the pipeline.
 *
 * Dummy on purpose: this portal never ships, so there is no account to check
 * a submitted username or password against. What the form does enforce is the
 * shape a real sign-on takes -- both fields present before a submit goes
 * anywhere -- since that is the behavior a recorded workflow has to survive.
 */
export function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    window.location.href = '/pipeline';
  }

  return (
    <div className="flex min-h-screen flex-col bg-slate-100">
      <div className="bg-amber-400/90 px-6 py-1 text-center text-[11px] font-semibold tracking-widest text-amber-950">
        {PORTAL_ENVIRONMENT}
      </div>

      <div className="flex flex-1 items-center justify-center px-6 py-16">
        <div className="w-full max-w-sm">
          <div className="mb-6 flex flex-col items-center gap-3 text-center">
            <span className="flex h-10 w-10 items-center justify-center rounded bg-sky-500 text-base font-bold text-white">
              M
            </span>
            <span>
              <span className="block text-sm font-semibold text-slate-900">{PORTAL_NAME}</span>
              <span className="block text-[11px] tracking-wide text-slate-500">
                {PORTAL_SUBTITLE}
              </span>
            </span>
          </div>

          <form
            className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm"
            data-testid="login-form"
            onSubmit={submit}
          >
            <h1 className="text-sm font-semibold text-slate-900">Sign in</h1>

            <div className="mt-4">
              <label
                className="block text-xs font-semibold tracking-wide text-slate-500 uppercase"
                htmlFor="login-username"
              >
                User ID
              </label>
              <input
                autoComplete="username"
                className="mt-1.5 w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:ring-1 focus:ring-sky-500 focus:outline-none"
                data-testid="login-username-input"
                id="login-username"
                onChange={(event) => setUsername(event.target.value)}
                required
                type="text"
                value={username}
              />
            </div>

            <div className="mt-4">
              <label
                className="block text-xs font-semibold tracking-wide text-slate-500 uppercase"
                htmlFor="login-password"
              >
                Password
              </label>
              <input
                autoComplete="current-password"
                className="mt-1.5 w-full rounded border border-slate-300 px-3 py-2 text-sm focus:border-sky-500 focus:ring-1 focus:ring-sky-500 focus:outline-none"
                data-testid="login-password-input"
                id="login-password"
                onChange={(event) => setPassword(event.target.value)}
                required
                type="password"
                value={password}
              />
            </div>

            <button
              className="mt-6 w-full rounded bg-sky-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-sky-500"
              data-testid="login-submit-button"
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
