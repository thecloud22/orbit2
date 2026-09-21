type FileTab = 'underwriting' | 'documents' | 'aus' | 'pricing';

const TABS: readonly { tab: FileTab; label: string; path: string; testId: string }[] = [
  { tab: 'underwriting', label: 'Underwriting', path: '/underwriting', testId: 'file-nav-underwriting' },
  {
    tab: 'documents',
    label: 'Documents',
    path: '/underwriting/documents',
    testId: 'file-nav-documents',
  },
  { tab: 'aus', label: 'Run AUS', path: '/underwriting/aus', testId: 'file-nav-aus' },
  { tab: 'pricing', label: 'Pricing', path: '/underwriting/pricing', testId: 'file-nav-pricing' },
];

/**
 * The tab bar a loan origination system actually has: one file, several
 * workspaces. Without this, documents/AUS/pricing are only reachable by
 * hand-typing a URL or going through `/features` -- fine for a fixture
 * directory, not for something meant to read as part of the app. Every tab
 * carries the same loan number forward, the way switching workspaces on a
 * real file does.
 */
export function FileNav({ loanNumber, current }: { loanNumber: string; current: FileTab }) {
  return (
    <nav className="mt-4 flex flex-wrap gap-1 border-b border-slate-200" data-testid="file-nav">
      {TABS.map((item) => (
        <a
          className={`rounded-t px-3 py-1.5 text-sm transition-colors ${
            item.tab === current
              ? 'border border-b-white bg-white font-medium text-slate-900'
              : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800'
          }`}
          data-testid={item.testId}
          href={`${item.path}?loan=${encodeURIComponent(loanNumber)}`}
          key={item.tab}
        >
          {item.label}
        </a>
      ))}
    </nav>
  );
}
