/**
 * The frame every screen sits in, and the pieces they all repeat.
 *
 * A heading that names the page and, beside it, the single next thing to do —
 * §4 asks for exactly that everywhere a status appears, so it belongs in the
 * frame rather than being remembered per screen.
 */
import type { ReactNode } from 'react';

export function Page({ kicker, title, aside, actions, children }: {
  kicker?: string; title: ReactNode; aside?: ReactNode; actions?: ReactNode; children: ReactNode;
}) {
  return (
    <main style={{ maxWidth: 1280, margin: '0 auto', padding: '26px 36px 72px' }}>
      <header style={{ display: 'flex', alignItems: 'flex-end', gap: 28, paddingBottom: 18 }}>
        <div style={{ flexGrow: 1, minWidth: 0 }}>
          {kicker && <div style={{ fontSize: 13, color: 'var(--ink-2)', marginBottom: 7 }}>{kicker}</div>}
          <h1 style={{ margin: 0, fontSize: 33, fontWeight: 700, letterSpacing: '-0.024em', lineHeight: 1.04 }}>
            {title}
          </h1>
        </div>
        {aside}
        {actions && <div style={{ display: 'flex', gap: 9, paddingBottom: 3 }}>{actions}</div>}
      </header>
      <div style={{ height: 2, background: 'var(--ink)' }} />
      {children}
    </main>
  );
}

export function Section({ title, note, right, children }: {
  title: string; note?: ReactNode; right?: ReactNode; children: ReactNode;
}) {
  return (
    <section style={{ paddingTop: 24 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, paddingBottom: 11 }}>
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>{title}</h2>
        {note && <span style={{ fontSize: 12.5, color: 'var(--ink-2)' }}>{note}</span>}
        <span style={{ flexGrow: 1 }} />
        {right}
      </div>
      {children}
    </section>
  );
}

type ButtonKind = 'primary' | 'dark' | 'ghost';
const look: Record<ButtonKind, React.CSSProperties> = {
  primary: { color: 'var(--ink)', background: 'var(--primary)', border: '1px solid var(--primary)' },
  dark: { color: 'var(--page)', background: 'var(--ink)', border: '1px solid var(--ink)' },
  ghost: { color: 'var(--ink)', background: 'transparent', border: '1px solid var(--rule-2)' },
};

export function Action({ kind = 'primary', disabled, why, onClick, children }: {
  kind?: ButtonKind; disabled?: boolean; why?: string; onClick?: () => void; children: ReactNode;
}) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} title={disabled ? why : undefined}
      style={{
        font: 'inherit', fontSize: 13.5, fontWeight: 600, borderRadius: 3, padding: '9px 16px',
        cursor: disabled ? 'not-allowed' : 'pointer',
        ...(disabled
          ? { color: 'var(--ink-2)', background: 'var(--panel-2)', border: '1px solid var(--rule-2)' }
          : look[kind]),
      }}>
      {children}
    </button>
  );
}

/**
 * A refusal, with the specific thing that stopped it. §4: the refusal names
 * the blocker rather than reporting a general failure, so this cannot be
 * rendered without at least one.
 */
export function Refusal({ title, blockers, tone = 'attention' }: {
  title: string; blockers: string[]; tone?: 'attention' | 'failed';
}) {
  const colour = tone === 'failed' ? 'var(--failed)' : 'var(--attention)';
  const ink = tone === 'failed' ? 'var(--failed-ink)' : 'var(--attention-ink)';
  const wash = tone === 'failed' ? 'var(--failed-wash)' : 'var(--attention-wash)';
  return (
    <div style={{ marginTop: 18, background: wash, borderLeft: `3px solid ${colour}`,
      borderRadius: 5, padding: '15px 18px' }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: ink, marginBottom: 7 }}>{title}</div>
      <ul style={{ margin: 0, padding: '0 0 0 18px', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {blockers.map((b, i) => (
          <li key={i} style={{ fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.55 }}>{b}</li>
        ))}
      </ul>
    </div>
  );
}

export function Register({ columns, children }: { columns: string[]; children: ReactNode }) {
  return (
    <div>
      <div style={{ borderTop: '1px solid var(--ink)', borderBottom: '1px solid var(--rule)',
        padding: '9px 0', display: 'flex', gap: 16, fontSize: 12.5, fontWeight: 600, color: 'var(--ink-2)' }}>
        {columns.map((c) => <span key={c} style={{ flex: c === '' ? 1 : 'none' }}>{c}</span>)}
      </div>
      {children}
    </div>
  );
}
