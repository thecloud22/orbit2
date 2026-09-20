/**
 * The few components that carry the specification, built before anything else
 * uses them (Decision 10). Each exists because a requirement asks for it, not
 * because a page wanted a box.
 */
import type { ReactNode } from 'react';

type State = 'ok' | 'running' | 'attention' | 'failed' | 'quiet';

const wash: Record<State, string> = {
  ok: 'var(--ok-wash)', running: 'var(--running-wash)',
  attention: 'var(--attention-wash)', failed: 'var(--failed-wash)', quiet: 'var(--panel-2)',
};
const fill: Record<State, string> = {
  ok: 'var(--ok)', running: 'var(--running)',
  attention: 'var(--attention)', failed: 'var(--failed)', quiet: 'var(--rule-2)',
};
const ink: Record<State, string> = {
  ok: 'var(--ok-ink)', running: 'var(--running-ink)',
  attention: 'var(--attention-ink)', failed: 'var(--failed-ink)', quiet: 'var(--ink-2)',
};

export const Dot = ({ state, size = 9 }: { state: State; size?: number }) => (
  <span style={{ width: size, height: size, borderRadius: '50%', background: fill[state], display: 'inline-block', flexShrink: 0 }} />
);

export const Chip = ({ state, children }: { state: State; children: ReactNode }) => (
  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12.5, fontWeight: 600,
    color: ink[state], background: wash[state], borderRadius: 3, padding: '4px 10px' }}>
    <Dot state={state} size={8} />{children}
  </span>
);

/**
 * Technical status and business outcome, as two facts that are never merged.
 * §10: a run that correctly established a record does not exist has succeeded.
 * Only the technical side is ever coloured; the conclusion is always plain ink,
 * because naming it is honest and judging it would be guessing.
 */
export const OutcomePair = ({ state, status, outcome, note }:
  { state: State; status: string; outcome: string; note: string }) => (
  <div style={{ display: 'flex', alignItems: 'stretch', padding: '20px 0 22px' }}>
    <div style={{ width: 326, display: 'flex', flexDirection: 'column', gap: 5 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Dot state={state} size={12} />
        <span style={{ fontSize: 25, fontWeight: 700, letterSpacing: '-0.018em',
          color: state === 'failed' ? 'var(--failed-ink)' : 'var(--ink)' }}>{status}</span>
      </div>
      <span style={{ fontSize: 13, color: 'var(--ink-2)' }}>What happened technically</span>
    </div>
    <div style={{ width: 1, background: 'var(--rule)', marginRight: 30 }} />
    <div style={{ flexGrow: 1, display: 'flex', flexDirection: 'column', gap: 5 }}>
      <span style={{ fontSize: 25, fontWeight: 700, letterSpacing: '-0.018em' }}>{outcome}</span>
      <span style={{ fontSize: 13, color: 'var(--ink-2)' }}>{note}</span>
    </div>
  </div>
);

/**
 * Four states, never one. §3: a list that could not load and a list with
 * nothing in it look identical if both are blank, and they mean opposite
 * things. There is no way to render an empty list here without choosing which.
 */
export type Emptiness =
  | { kind: 'nothingYet'; invite: string; action?: ReactNode }
  | { kind: 'nothingMatching'; searched: string; total?: number; clear?: ReactNode }
  | { kind: 'notLoadedYet' }
  | { kind: 'couldNotLoad'; why: string; retry?: ReactNode };

export function EmptyState({ of }: { of: Emptiness }) {
  const frame: React.CSSProperties = { padding: '28px 22px', display: 'flex', flexDirection: 'column',
    alignItems: 'center', gap: 9, textAlign: 'center' };
  switch (of.kind) {
    case 'nothingYet':
      return <div style={frame}><strong style={{ fontSize: 15 }}>Nothing here yet</strong>
        <span style={{ fontSize: 13, color: 'var(--ink-2)', maxWidth: 360, lineHeight: 1.5 }}>{of.invite}</span>{of.action}</div>;
    case 'nothingMatching':
      return <div style={frame}><strong style={{ fontSize: 15 }}>Nothing matches <span style={{ fontFamily: 'var(--mono)' }}>{of.searched}</span></strong>
        <span style={{ fontSize: 13, color: 'var(--ink-2)' }}>
          {of.total === undefined ? 'Nothing carries that reference.' : `There are ${of.total} runs, and none carries that reference.`}
        </span>{of.clear}</div>;
    case 'notLoadedYet':
      return <div style={{ ...frame, alignItems: 'stretch' }} aria-label="Loading">
        {[0.9, 0.7, 0.5].map((o, i) => (
          <span key={i} style={{ height: 10, borderRadius: 2, background: 'var(--panel-2)', opacity: o }} />
        ))}</div>;
    case 'couldNotLoad':
      return <div style={{ padding: '22px', borderLeft: '3px solid var(--failed)', background: 'var(--failed-wash)',
        borderRadius: 5, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <strong style={{ fontSize: 15, color: 'var(--failed-ink)' }}>This did not load</strong>
        <span style={{ fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.5 }}>{of.why}</span>{of.retry}</div>;
  }
}

/** A value read verbatim from a machine. Never a label, never a duration. */
export const Verbatim = ({ children }: { children: ReactNode }) => (
  <span style={{ fontFamily: 'var(--mono)', fontWeight: 600 }}>{children}</span>
);

export const Row = ({ label, children }: { label: string; children: ReactNode }) => (
  <div style={{ display: 'flex', gap: 13, fontSize: 13.5 }}>
    <span style={{ width: 104, flexShrink: 0, color: 'var(--ink-2)' }}>{label}</span>
    <span style={{ flexGrow: 1 }}>{children}</span>
  </div>
);
