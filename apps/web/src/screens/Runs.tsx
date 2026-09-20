import { Page, Section } from '../Page.tsx';
import { Chip, EmptyState } from '../ui.tsx';
import { useFetch } from '../fetching.ts';
import { href, type Route } from '../router.ts';

interface Run { reference: string; status: string; outcome: string | null; workflow_name: string;
  version: number; started_at: string | null; ended_at: string | null }

const stateOf = (s: string) => s === 'succeeded' ? 'ok' as const : s === 'failed' ? 'failed' as const
  : s === 'running' ? 'running' as const : s === 'waitingForAPerson' ? 'attention' as const : 'quiet' as const;

const took = (r: Run) => (r.started_at && r.ended_at)
  ? `${((+new Date(r.ended_at) - +new Date(r.started_at)) / 1000).toFixed(1)}s`
  : r.started_at ? 'running' : '—';

export function Runs({ go }: { go: (to: Route) => void }) {
  const runs = useFetch<Run[]>('/api/runs');
  const link = (to: Route) => ({
    href: href(to),
    onClick: (e: React.MouseEvent) => {
      if (e.metaKey || e.ctrlKey || e.shiftKey) return;
      e.preventDefault(); go(to);
    },
  });

  const counts = runs.state === 'loaded'
    ? {
        queued: runs.value.filter((r) => r.status === 'queued').length,
        running: runs.value.filter((r) => r.status === 'running').length,
        waiting: runs.value.filter((r) => r.status === 'waitingForAPerson').length,
        failed: runs.value.filter((r) => r.status === 'failed').length,
      }
    : null;

  return (
    <Page title="Runs"
      aside={<p style={{ margin: 0, fontSize: 14, lineHeight: 1.55, color: 'var(--ink-2)', maxWidth: 520 }}>
        Everything in flight and everything finished. A run waiting on a person is work, not history, so it
        is counted apart.
      </p>}>
      {counts && (
        <div style={{ display: 'flex', gap: 14, paddingTop: 20 }}>
          <Tile n={counts.queued} label="Waiting to start" state="quiet" />
          <Tile n={counts.running} label="Running now" state="running" />
          <Tile n={counts.waiting} label="Waiting on a person" state="attention"
            note="Nothing here times out into a wrong answer." />
          <Tile n={counts.failed} label="Failed" state="failed" />
        </div>
      )}

      <Section title="All runs" note={runs.state === 'loaded' ? String(runs.value.length) : undefined}>
        {runs.state === 'empty'
          ? <div style={{ border: '1px solid var(--rule)', borderRadius: 6, background: 'var(--panel)' }}>
              <EmptyState of={runs.of} /></div>
          : runs.value.length === 0
            ? <div style={{ border: '1px solid var(--rule)', borderRadius: 6, background: 'var(--panel)' }}>
                <EmptyState of={{ kind: 'nothingYet',
                  invite: 'Start one from an agent and it will appear here with its evidence.' }} /></div>
            : <div style={{ borderTop: '1px solid var(--ink)' }}>
                <div style={{ borderBottom: '1px solid var(--rule)', padding: '9px 0', display: 'flex',
                  gap: 16, fontSize: 12.5, fontWeight: 600, color: 'var(--ink-2)' }}>
                  <span style={{ width: 74 }}>Run</span>
                  <span style={{ width: 210 }}>Agent</span>
                  <span style={{ width: 170 }}>Status</span>
                  <span style={{ flexGrow: 1 }}>Conclusion</span>
                  <span style={{ width: 64, textAlign: 'right' }}>Took</span>
                </div>
                {runs.value.map((r) => (
                  <a key={r.reference} {...link({ at: 'run', reference: r.reference })}
                    style={{ textDecoration: 'none', color: 'var(--ink)', borderBottom: '1px solid var(--rule)',
                      padding: '12px 0', display: 'flex', gap: 16, alignItems: 'center' }}>
                    <span style={{ width: 74, fontFamily: 'var(--mono)', fontSize: 12.5,
                      color: 'var(--ink-2)' }}>{r.reference}</span>
                    <div style={{ width: 210 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 500 }}>{r.workflow_name}</div>
                      <div style={{ fontSize: 11.5, color: 'var(--ink-2)' }}>version {r.version}</div>
                    </div>
                    <span style={{ width: 170 }}><Chip state={stateOf(r.status)}>{r.status}</Chip></span>
                    <span style={{ flexGrow: 1, fontSize: 13.5 }}>{r.outcome ?? '—'}</span>
                    <span style={{ width: 64, textAlign: 'right', fontFamily: 'var(--mono)', fontSize: 12.5,
                      color: 'var(--ink-2)' }}>{took(r)}</span>
                  </a>
                ))}
              </div>}
      </Section>
    </Page>
  );
}

const fill = { quiet: 'var(--rule-2)', running: 'var(--running)', attention: 'var(--attention)', failed: 'var(--failed)' };

const Tile = ({ n, label, state, note }: {
  n: number; label: string; state: keyof typeof fill; note?: string;
}) => (
  <div style={{ flexGrow: 1, flexBasis: 0, background: 'var(--panel)', border: '1px solid var(--rule)',
    borderTop: `3px solid ${fill[state]}`, borderRadius: 5, padding: '14px 16px' }}>
    <div style={{ fontSize: 27, fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1, marginBottom: 6 }}>{n}</div>
    <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 3 }}>{label}</div>
    {note && <div style={{ fontSize: 12, color: 'var(--ink-2)', lineHeight: 1.4 }}>{note}</div>}
  </div>
);
