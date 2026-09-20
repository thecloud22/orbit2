export function Nav({ current }: { current: string }) {
  return (
    <nav style={{ height: 54, background: 'var(--nav)', display: 'flex', alignItems: 'center',
        gap: 26, padding: '0 36px', color: 'var(--page)' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <svg width="21" height="21" viewBox="0 0 22 22" fill="none" aria-hidden>
            <ellipse cx="11" cy="11" rx="9.3" ry="5.1" transform="rotate(-30 11 11)" stroke="var(--page)" strokeWidth="1.5" />
            <circle cx="2.95" cy="15.65" r="2.45" fill="var(--primary)" />
          </svg>
          <span style={{ fontSize: 15, fontWeight: 700, letterSpacing: '0.24em' }}>ORBIT</span>
        </span>
        {['Home', 'Agents', 'Runs', 'Admin', 'Audit'].map((item) => (
          <span key={item} style={{ fontSize: 13.5, color: item === current ? 'var(--page)' : '#8E8E88',
            fontWeight: item === current ? 600 : 400,
            boxShadow: item === current ? 'inset 0 -2px 0 var(--primary)' : undefined, paddingBottom: 4 }}>{item}</span>
        ))}
    </nav>
  );
}
