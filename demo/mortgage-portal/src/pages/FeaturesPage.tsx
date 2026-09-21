import { Shell } from '../components/Shell';

const SAMPLE_LOAN = 'ML-26-04471';

interface FeatureLink {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly href: string;
}

interface FeatureGroup {
  readonly title: string;
  readonly description: string;
  readonly items: readonly FeatureLink[];
}

const GROUPS: readonly FeatureGroup[] = [
  {
    title: 'Sign-on',
    description: 'Ahead of the pipeline.',
    items: [
      {
        id: 'login',
        label: 'Sign in',
        description: 'Dummy sign-on. User ID and password are both required; any values work.',
        href: '/login',
      },
    ],
  },
  {
    title: 'Pipeline & underwriting',
    description: 'The core flow every fixture and new feature below builds on.',
    items: [
      {
        id: 'pipeline',
        label: 'Pipeline',
        description: 'The queue of files awaiting a decision, and lookup by loan number.',
        href: '/pipeline',
      },
      {
        id: 'underwriting',
        label: 'File review',
        description: 'The underwriting summary, conditions, and decision for a single file.',
        href: `/underwriting?loan=${SAMPLE_LOAN}`,
      },
    ],
  },
  {
    title: 'Binder-testing fixtures',
    description:
      'Each makes one acceptance criterion reproducible on demand, on its own route, separate from the pipeline/underwriting flow above.',
    items: [
      {
        id: 'session-expiry',
        label: 'Session expiry mid-run',
        description:
          'A session flips from active to expired part-way through; a decision submitted after expiry is refused rather than silently succeeding.',
        href: `/underwriting/session-expiry?loan=${SAMPLE_LOAN}`,
      },
      {
        id: 'flaky',
        label: 'A control that resolves twice',
        description: 'The first "Approve" click fails with a transient error; the second succeeds.',
        href: `/underwriting/flaky?loan=${SAMPLE_LOAN}`,
      },
      {
        id: 'pipeline-states',
        label: 'List-state distinctions',
        description:
          'One route, five states: loading, error, empty, no-match, and loaded — four different reasons a list can look blank.',
        href: '/pipeline/states?state=loaded',
      },
      {
        id: 'ambiguous',
        label: 'Ambiguous elements',
        description:
          'Two "Approve" buttons, identical accessible name, resolved only by which panel each sits under.',
        href: `/underwriting/ambiguous?loan=${SAMPLE_LOAN}`,
      },
      {
        id: 'slow',
        label: 'Slow async response inside the SPA',
        description: 'Approval pends for a few seconds before the banner appears, no page reload.',
        href: `/underwriting/slow?loan=${SAMPLE_LOAN}&delay=2000`,
      },
      {
        id: 'reference',
        label: 'Non-deterministic content',
        description: 'A confirmation code and timestamp that are different every run.',
        href: `/underwriting/reference?loan=${SAMPLE_LOAN}`,
      },
    ],
  },
  {
    title: 'Loan lifecycle',
    description: 'A fuller origination system, all reading and writing the same shared loan data.',
    items: [
      {
        id: 'apply',
        label: 'New loan application',
        description:
          'The four-step intake form. Submitting creates a real file and opens it on the ordinary underwriting review page.',
        href: '/applications/new',
      },
      {
        id: 'documents',
        label: 'Document checklist',
        description: 'Stipulations tracker. Approval is gated until every required document clears.',
        href: `/underwriting/documents?loan=${SAMPLE_LOAN}`,
      },
      {
        id: 'aus',
        label: 'Automated underwriting run',
        description:
          'A deterministic Approve/Refer/Ineligible verdict, with findings, read off the file’s own figures.',
        href: `/underwriting/aus?loan=${SAMPLE_LOAN}`,
      },
      {
        id: 'pricing',
        label: 'Rate lock / pricing',
        description: 'Pick a rate, lock it, watch the lock expire and re-lock at current pricing.',
        href: `/underwriting/pricing?loan=${SAMPLE_LOAN}&lockSeconds=60`,
      },
    ],
  },
];

/**
 * A directory of everything built past the original pipeline/underwriting
 * flow, so a person can find and click into any of it without reading
 * `TODO.md`. Sample links use `ML-26-04471`, a loan that clears every
 * threshold, so each one opens onto something worth looking at rather than a
 * blank or ambiguous file.
 */
export function FeaturesPage() {
  return (
    <Shell current="/features">
      <div className="mx-auto max-w-4xl px-6 py-8">
        <h1 className="text-xl font-semibold text-slate-900">Features</h1>
        <p className="mt-1 text-sm text-slate-600">
          Everything built beyond the pipeline and a single file&apos;s underwriting review.
        </p>

        {GROUPS.map((group) => (
          <section className="mt-8" data-testid={`feature-group-${group.title}`} key={group.title}>
            <h2 className="text-sm font-semibold tracking-wide text-slate-500 uppercase">
              {group.title}
            </h2>
            <p className="mt-1 text-sm text-slate-600">{group.description}</p>

            <ul className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              {group.items.map((item) => (
                <li key={item.id}>
                  <a
                    className="block h-full rounded-lg border border-slate-200 bg-white p-4 shadow-sm transition-colors hover:border-sky-400 hover:bg-sky-50"
                    data-testid={`feature-link-${item.id}`}
                    href={item.href}
                  >
                    <div className="text-sm font-semibold text-slate-900">{item.label}</div>
                    <p className="mt-1 text-xs text-slate-600">{item.description}</p>
                    <div className="mt-2 font-mono text-[11px] text-sky-700">{item.href}</div>
                  </a>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </Shell>
  );
}
