import { AmbiguousDecisionPage } from '../pages/AmbiguousDecisionPage';
import { ApplicationIntakePage } from '../pages/ApplicationIntakePage';
import { AuditTrailPage } from '../pages/AuditTrailPage';
import { AutomatedUnderwritingPage } from '../pages/AutomatedUnderwritingPage';
import { BorrowerDashboardPage } from '../pages/BorrowerDashboardPage';
import { BorrowerLoginPage } from '../pages/BorrowerLoginPage';
import { CommitmentLetterPage } from '../pages/CommitmentLetterPage';
import { DeclinePage } from '../pages/DeclinePage';
import { DocumentsPage } from '../pages/DocumentsPage';
import { FeaturesPage } from '../pages/FeaturesPage';
import { FlakyDecisionPage } from '../pages/FlakyDecisionPage';
import { LoanPage } from '../pages/LoanPage';
import { LoginPage } from '../pages/LoginPage';
import { PipelineBrowsePage } from '../pages/PipelineBrowsePage';
import { PipelinePage } from '../pages/PipelinePage';
import { PipelineStatesPage } from '../pages/PipelineStatesPage';
import { PricingPage } from '../pages/PricingPage';
import { ReferencePage } from '../pages/ReferencePage';
import { SessionExpiryPage } from '../pages/SessionExpiryPage';
import { SlowDecisionPage } from '../pages/SlowDecisionPage';
import { Shell } from '../components/Shell';

/**
 * Pathname switch, matching the other portals in this repository.
 *
 * `/underwriting` takes `?loan=` rather than a path segment, because that is
 * how the real thing works: an underwriter pastes a loan number into a lookup
 * and lands on the file, and a recorded workflow does exactly the same.
 *
 * The root path is sign-on, ahead of the pipeline it used to open directly --
 * a recorded workflow now starts there, the way a real session does.
 */
export function App() {
  const path = window.location.pathname.replace(/\/+$/, '');

  if (path === '' || path === '/login') {
    return <LoginPage />;
  }

  if (path === '/pipeline') {
    return <PipelinePage />;
  }

  if (path === '/pipeline/states') {
    return <PipelineStatesPage />;
  }

  if (path === '/pipeline/browse') {
    return <PipelineBrowsePage />;
  }

  if (path === '/underwriting') {
    return <LoanPage />;
  }

  if (path === '/underwriting/session-expiry') {
    return <SessionExpiryPage />;
  }

  if (path === '/underwriting/flaky') {
    return <FlakyDecisionPage />;
  }

  if (path === '/underwriting/ambiguous') {
    return <AmbiguousDecisionPage />;
  }

  if (path === '/underwriting/slow') {
    return <SlowDecisionPage />;
  }

  if (path === '/underwriting/reference') {
    return <ReferencePage />;
  }

  if (path === '/underwriting/documents') {
    return <DocumentsPage />;
  }

  if (path === '/underwriting/automated-underwriting') {
    return <AutomatedUnderwritingPage />;
  }

  if (path === '/underwriting/pricing') {
    return <PricingPage />;
  }

  if (path === '/underwriting/decline') {
    return <DeclinePage />;
  }

  if (path === '/underwriting/commitment-letter') {
    return <CommitmentLetterPage />;
  }

  if (path === '/underwriting/audit-trail') {
    return <AuditTrailPage />;
  }

  if (path === '/applications/new') {
    return <ApplicationIntakePage />;
  }

  if (path === '/borrower/login') {
    return <BorrowerLoginPage />;
  }

  if (path === '/borrower') {
    return <BorrowerDashboardPage />;
  }

  if (path === '/features') {
    return <FeaturesPage />;
  }

  return (
    <Shell>
      <div className="mx-auto max-w-2xl px-8 py-16">
        <h1 className="text-xl font-semibold text-slate-900">Page not found</h1>
        <p className="mt-2 text-sm text-slate-600">
          <a className="text-sky-700 underline" href="/pipeline">
            Return to the pipeline
          </a>
        </p>
      </div>
    </Shell>
  );
}
