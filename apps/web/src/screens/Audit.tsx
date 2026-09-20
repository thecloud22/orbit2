import { Page, Refusal, Section } from '../Page.tsx';
import { EmptyState } from '../ui.tsx';
import { useFetch } from '../fetching.ts';

interface Audit {
  entries: Array<{ id: string; act: string; object_kind: string; object_id: string | null;
    changed: Record<string, unknown>; reason: string | null; actor: string | null; at: string }>;
  total: string;
}

const describe = (changed: Record<string, unknown>) =>
  Object.entries(changed).map(([k, v]) =>
    `${k} ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`).join(', ');

export function AuditScreen() {
  const audit = useFetch<Audit>('/api/audit');
  if (audit.state === 'empty') {
    return <Page title="Audit history"><div style={{ marginTop: 18, border: '1px solid var(--rule)',
      borderRadius: 6, background: 'var(--panel)' }}><EmptyState of={audit.of} /></div></Page>;
  }
  const { entries, total } = audit.value;

  return (
    <Page title="Audit history"
      aside={<p style={{ margin: 0, fontSize: 14, lineHeight: 1.55, color: 'var(--ink-2)', maxWidth: 560 }}>
        Every attributable act, in the order it happened. Entries are added and never changed — there is no
        operation in Orbit that edits one.
      </p>}>
      {/* An absent fact is shown as absent. Not a blank column, and never an
          invented name: §12's value is that a reader can establish on whose
          authority something was done, and a fabricated actor makes that
          sentence false rather than merely unanswered. */}
      <Refusal title="Who did it is not recorded yet" blockers={[
        'Orbit has no sign-in, so it cannot attribute these acts to a person and will not invent one.',
        'When sign-in arrives the column fills from that day forward. Entries written before it never will, because nothing here edits an entry.',
      ]} />

      <Section title="Entries" note={`showing ${entries.length} of ${total}`}>
        <div style={{ borderTop: '1px solid var(--ink)' }}>
          <div style={{ borderBottom: '1px solid var(--rule)', padding: '9px 0', display: 'flex', gap: 18,
            fontSize: 12.5, fontWeight: 600, color: 'var(--ink-2)' }}>
            <span style={{ width: 150 }}>When</span>
            <span style={{ width: 170 }}>Act</span>
            <span style={{ width: 170 }}>Object</span>
            <span style={{ flexGrow: 1 }}>What changed</span>
            <span style={{ width: 110, textAlign: 'right' }}>Who</span>
          </div>
          {entries.map((e) => (
            <div key={e.id} style={{ borderBottom: '1px solid var(--rule)', padding: '11px 0',
              display: 'flex', gap: 18, alignItems: 'baseline' }}>
              <span style={{ width: 150, fontFamily: 'var(--mono)', fontSize: 11.5, color: 'var(--ink-2)' }}>
                {new Date(e.at).toLocaleString('en-US', { month: 'short', day: 'numeric',
                  hour: '2-digit', minute: '2-digit', second: '2-digit' })}
              </span>
              <span style={{ width: 170, fontSize: 13.5, fontWeight: 600 }}>{e.act}</span>
              <span style={{ width: 170, fontSize: 13, color: 'var(--ink-2)' }}>{e.object_kind}</span>
              <span style={{ flexGrow: 1, minWidth: 0, fontSize: 12.5, color: 'var(--ink-2)',
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {e.reason ?? describe(e.changed)}
              </span>
              <span style={{ width: 110, textAlign: 'right', fontSize: 12.5, color: 'var(--ink-2)',
                fontStyle: 'italic' }}>{e.actor ?? 'not recorded'}</span>
            </div>
          ))}
        </div>
      </Section>
    </Page>
  );
}
