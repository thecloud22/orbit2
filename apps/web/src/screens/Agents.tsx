import { Action, Page, Section } from '../Page.tsx';
import { Chip, EmptyState } from '../ui.tsx';
import { useFetch } from '../fetching.ts';
import { href, type Route } from '../router.ts';

interface Agent { id: string; name: string; steps: string; outstanding: string;
  live_version: number | null; confirmed_at: string | null }

/**
 * One derived status per agent, and beside it the single next thing to do.
 *
 * §4: the status is computed from facts the system already holds and never
 * stored, so it cannot disagree with them — which is why it is worked out here
 * from the same fields the agent page uses rather than read from a column.
 */
function statusOf(a: Agent) {
  if (Number(a.outstanding) > 0) return { label: 'Draft — needs your input', state: 'attention' as const,
    next: `Answer ${a.outstanding}` };
  if (a.live_version) return { label: 'Active', state: 'ok' as const, next: 'Watch runs' };
  if (a.confirmed_at) return { label: 'Confirmed', state: 'running' as const, next: 'Publish a version' };
  return { label: 'Draft — ready to confirm', state: 'quiet' as const, next: 'Confirm the process' };
}

export function Agents({ go }: { go: (to: Route) => void }) {
  const agents = useFetch<Agent[]>('/api/workflows');
  const link = (to: Route) => ({
    href: href(to),
    onClick: (e: React.MouseEvent) => {
      if (e.metaKey || e.ctrlKey || e.shiftKey) return;
      e.preventDefault(); go(to);
    },
  });

  return (
    <Page title="Agents"
      aside={<p style={{ margin: 0, fontSize: 14, lineHeight: 1.55, color: 'var(--ink-2)', maxWidth: 520 }}>
        Each shows one status, worked out from what the system already holds so it cannot disagree with
        itself. Beside it is the single next thing to do.
      </p>}
      actions={<Action onClick={() => go({ at: 'bringIn' })}>Bring in a procedure</Action>}>
      <Section title="All agents" note={agents.state === 'loaded' ? String(agents.value.length) : undefined}>
        {agents.state === 'empty'
          ? <div style={{ border: '1px solid var(--rule)', borderRadius: 6, background: 'var(--panel)' }}>
              <EmptyState of={agents.of} /></div>
          : agents.value.length === 0
            ? <div style={{ border: '1px solid var(--rule)', borderRadius: 6, background: 'var(--panel)' }}>
                <EmptyState of={{ kind: 'nothingYet',
                  invite: 'Bring in a procedure somebody already follows by hand, and it will appear here.',
                  action: <Action onClick={() => go({ at: 'bringIn' })}>Bring in a procedure</Action> }} /></div>
            : <div style={{ borderTop: '1px solid var(--ink)' }}>
                <div style={{ borderBottom: '1px solid var(--rule)', padding: '9px 0', display: 'flex',
                  gap: 18, fontSize: 12.5, fontWeight: 600, color: 'var(--ink-2)' }}>
                  <span style={{ width: 260 }}>Agent</span>
                  <span style={{ width: 210 }}>Status</span>
                  <span style={{ width: 110 }}>Live version</span>
                  <span style={{ flexGrow: 1 }}>Next action</span>
                </div>
                {agents.value.map((a) => {
                  const s = statusOf(a);
                  return (
                    <a key={a.id} {...link({ at: 'agent', id: a.id })}
                      style={{ textDecoration: 'none', color: 'var(--ink)', borderBottom: '1px solid var(--rule)',
                        padding: '14px 0', display: 'flex', gap: 18, alignItems: 'center' }}>
                      <div style={{ width: 260 }}>
                        <div style={{ fontSize: 14.5, fontWeight: 600 }}>{a.name}</div>
                        <div style={{ fontSize: 12.5, color: 'var(--ink-2)' }}>{a.steps} steps</div>
                      </div>
                      <span style={{ width: 210 }}><Chip state={s.state}>{s.label}</Chip></span>
                      <span style={{ width: 110, fontSize: 13, color: 'var(--ink-2)' }}>
                        {a.live_version ? `Version ${a.live_version}` : '—'}</span>
                      <span style={{ flexGrow: 1, fontSize: 13.5, fontWeight: 600,
                        color: 'var(--failed-ink)' }}>{s.next}</span>
                    </a>
                  );
                })}
              </div>}
      </Section>
    </Page>
  );
}
