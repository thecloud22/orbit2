import type { ReactNode } from 'react';
import { Action, Page, Section } from '../Page.tsx';
import { Chip, EmptyState } from '../ui.tsx';
import { useFetch } from '../fetching.ts';
import { href, type Route } from '../router.ts';

interface Agent { id: string; name: string; steps: string; outstanding: string; live_version: number | null }
interface Run { reference: string; status: string; outcome: string | null; workflow_name: string }

const stateOf = (s: string) => s === 'succeeded' ? 'ok' as const : s === 'failed' ? 'failed' as const
  : s === 'running' ? 'running' as const : s === 'waitingForAPerson' ? 'attention' as const : 'quiet' as const;

/**
 * The same page on day one and in use.
 *
 * Four sections in a fixed order that never rearranges. On day one they are a
 * quiet line each, and the one with nothing in it yet carries the invitation —
 * §3's four-empty-states rule applied to a page rather than to a list. A home
 * page that only works once you are busy is wrong on the day it matters most.
 */
export function Home({ go }: { go: (to: Route) => void }) {
  const agents = useFetch<Agent[]>('/api/workflows');
  const runs = useFetch<Run[]>('/api/runs');

  const link = (to: Route) => ({
    href: href(to),
    onClick: (e: React.MouseEvent) => {
      if (e.metaKey || e.ctrlKey || e.shiftKey) return;
      e.preventDefault(); go(to);
    },
  });

  const needsYou = agents.state === 'loaded' ? agents.value.filter((a) => Number(a.outstanding) > 0) : [];
  const finished = runs.state === 'loaded' ? runs.value.slice(0, 5) : [];
  const none = agents.state === 'loaded' && agents.value.length === 0;

  return (
    <Page
      kicker={new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
      title={none ? <>Start with a procedure<br />you already have</>
        : needsYou.length > 0 ? `${needsYou.length} thing${needsYou.length === 1 ? '' : 's'} need you`
        : 'Nothing needs you'}
      actions={<Action onClick={() => go({ at: 'newAgent' })}>New agent</Action>}
    >
      <Section title="Needs you">
        {needsYou.length === 0
          ? <Quiet>Nothing needs you. This fills with runs that have stopped for a person, and drafts with an unanswered question.</Quiet>
          : <div style={{ borderTop: '1px solid var(--ink)' }}>
              {needsYou.map((a) => (
                <a key={a.id} {...link({ at: 'agent', id: a.id })} style={rowStyle}>
                  <span style={{ flexGrow: 1, fontSize: 14, fontWeight: 600 }}>{a.name}</span>
                  <Chip state="attention">{a.outstanding} outstanding</Chip>
                </a>
              ))}
            </div>}
      </Section>

      <Section title="Your agents" note={agents.state === 'loaded' ? String(agents.value.length) : undefined}>
        {agents.state === 'empty' ? <Framed><EmptyState of={agents.of} /></Framed>
          : none ? <FirstAgent go={go} />
          : <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              {agents.value.map((a) => (
                <a key={a.id} {...link({ at: 'agent', id: a.id })}
                  style={{ textDecoration: 'none', color: 'var(--ink)', width: 280, border: '1px solid var(--rule)',
                    borderRadius: 5, background: 'var(--panel)', padding: '14px 16px',
                    display: 'flex', flexDirection: 'column', gap: 9 }}>
                  <span style={{ fontSize: 14, fontWeight: 600 }}>{a.name}</span>
                  <span style={{ fontSize: 12.5, color: 'var(--ink-2)', flexGrow: 1 }}>{a.steps} steps</span>
                  {a.live_version
                    ? <Chip state="ok">Version {a.live_version} live</Chip>
                    : <Chip state={Number(a.outstanding) > 0 ? 'attention' : 'quiet'}>
                        {Number(a.outstanding) > 0 ? 'Needs your input' : 'Draft'}</Chip>}
                </a>
              ))}
            </div>}
      </Section>

      <Section title="Recently finished"
        right={finished.length > 0
          ? <a {...link({ at: 'runs' })} style={{ fontSize: 13.5, fontWeight: 600, textDecoration: 'none' }}>All runs</a>
          : undefined}>
        {runs.state === 'empty' ? <Framed><EmptyState of={runs.of} /></Framed>
          : finished.length === 0
            ? <Quiet>No runs yet. Every run that finishes is kept here with its evidence, for good.</Quiet>
            : <div style={{ borderTop: '1px solid var(--ink)' }}>
                {finished.map((r, i) => (
                  <a key={r.reference} {...link({ at: 'run', reference: r.reference })}
                    style={{ ...rowStyle, borderBottom: i === finished.length - 1 ? 'none' : '1px solid var(--rule)' }}>
                    <span style={{ width: 70, fontFamily: 'var(--mono)', fontSize: 12.5, color: 'var(--ink-2)' }}>{r.reference}</span>
                    <span style={{ width: 200, fontSize: 13.5, fontWeight: 500 }}>{r.workflow_name}</span>
                    <span style={{ width: 124 }}><Chip state={stateOf(r.status)}>{r.status}</Chip></span>
                    {/* Never coloured: naming a conclusion is honest, judging
                        somebody else's would be guessing. */}
                    <span style={{ flexGrow: 1, fontSize: 13.5 }}>{r.outcome ?? '—'}</span>
                  </a>
                ))}
              </div>}
      </Section>
    </Page>
  );
}

const rowStyle: React.CSSProperties = {
  textDecoration: 'none', color: 'var(--ink)', borderBottom: '1px solid var(--rule)',
  padding: '11px 0', display: 'flex', alignItems: 'center', gap: 16,
};
const Quiet = ({ children }: { children: ReactNode }) => (
  <div style={{ borderTop: '1px solid var(--rule)', padding: '15px 0', fontSize: 13.5, color: 'var(--ink-2)' }}>{children}</div>
);
const Framed = ({ children }: { children: ReactNode }) => (
  <div style={{ border: '1px solid var(--rule)', borderRadius: 6, background: 'var(--panel)' }}>{children}</div>
);

function FirstAgent({ go }: { go: (to: Route) => void }) {
  return (
    <div style={{ border: '1px solid var(--rule)', borderRadius: 6, background: 'var(--panel)', padding: '26px 28px' }}>
      <div style={{ fontSize: 17, fontWeight: 700, marginBottom: 6 }}>No agents yet</div>
      <p style={{ margin: '0 0 20px', fontSize: 13.5, color: 'var(--ink-2)', lineHeight: 1.6, maxWidth: 640 }}>
        An agent starts as a procedure somebody already follows by hand. There are two ways to bring one in,
        and they meet at the same place: a draft you check before anything is published.
      </p>
      <div style={{ display: 'flex', gap: 16 }}>
        <Way title="Write it out" onPick={() => go({ at: 'newAgent' })}
          body="Describe the procedure the way you would to somebody starting Monday. Orbit works through it against the application and shows you what it matched." />
        <Way title="Show it once" onPick={() => go({ at: 'newAgent' })}
          body="Do the job by hand while Orbit watches. It records what you touched rather than guessing what you meant, which suits an older application." />
      </div>
    </div>
  );
}

const Way = ({ title, body, onPick }: { title: string; body: string; onPick: () => void }) => (
  <button type="button" onClick={onPick} style={{ font: 'inherit', textAlign: 'left', cursor: 'pointer',
    flexGrow: 1, border: '1px solid var(--rule-2)', borderRadius: 5, background: 'transparent', padding: '18px 20px' }}>
    <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>{title}</div>
    <div style={{ fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.55 }}>{body}</div>
  </button>
);
