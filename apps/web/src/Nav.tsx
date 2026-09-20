import { href, type Route } from './router.ts';

const ITEMS: Array<{ label: string; to: Route }> = [
  { label: 'Home', to: { at: 'home' } },
  { label: 'Agents', to: { at: 'agents' } },
  { label: 'Runs', to: { at: 'runs' } },
  { label: 'Admin', to: { at: 'admin' } },
  { label: 'Audit', to: { at: 'audit' } },
  { label: 'Help', to: { at: 'help' } },
];

/** An orbit: a bounded path, and one thing travelling it. */
const Mark = () => (
  <svg width="21" height="21" viewBox="0 0 22 22" fill="none" aria-hidden style={{ flexShrink: 0 }}>
    <ellipse cx="11" cy="11" rx="9.3" ry="5.1" transform="rotate(-30 11 11)"
      stroke="var(--page)" strokeWidth="1.5" />
    <circle cx="2.95" cy="15.65" r="2.45" fill="var(--primary)" />
  </svg>
);

export function Nav({ current, go }: { current: Route['at']; go: (to: Route) => void }) {
  const isCurrent = (to: Route) =>
    to.at === current
    || (to.at === 'agents' && (current === 'agent' || current === 'bringIn'))
    || (to.at === 'runs' && (current === 'run' || current === 'start'));

  const link = (to: Route) => ({
    href: href(to),
    onClick: (e: React.MouseEvent) => {
      if (e.metaKey || e.ctrlKey || e.shiftKey) return;
      e.preventDefault(); go(to);
    },
  });

  return (
    <nav style={{ height: 54, background: 'var(--nav)', display: 'flex', alignItems: 'center',
      gap: 26, padding: '0 36px' }}>
      <a {...link({ at: 'home' })} style={{ display: 'flex', alignItems: 'center', gap: 9, textDecoration: 'none' }}>
        <Mark />
        <span style={{ fontSize: 15, fontWeight: 700, letterSpacing: '0.24em', color: 'var(--page)' }}>ORBIT</span>
      </a>
      <div style={{ display: 'flex', gap: 22, fontSize: 13.5 }}>
        {ITEMS.map((item) => (
          <a key={item.label} {...link(item.to)}
            style={{ textDecoration: 'none', paddingBottom: 4,
              color: isCurrent(item.to) ? 'var(--page)' : '#8E8E88',
              fontWeight: isCurrent(item.to) ? 600 : 400,
              boxShadow: isCurrent(item.to) ? 'inset 0 -2px 0 var(--primary)' : undefined }}>
            {item.label}
          </a>
        ))}
      </div>
    </nav>
  );
}
