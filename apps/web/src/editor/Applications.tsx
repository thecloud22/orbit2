/**
 * The applications an agent works on (Orbit 2.2, C11).
 *
 * One, for an agent brought in against one — shown as it always was, in the
 * page's kicker. More than one for the swivel chair: a web portal and a green
 * screen, each sentence of work tagged with the one it happens on. Adding one
 * here is the author's act; the sort then proposes a tag for each sentence.
 */
import { useState } from 'react';
import { useFetch } from '../fetching.ts';
import { Chip } from '../ui.tsx';
import type { Draft } from './model.ts';

export type AgentApplication = NonNullable<Draft['applications']>[number];

/** How a connector reads to a person. */
export const connectorName = (surface: string) => (surface === 'terminal' ? 'Terminal · TN3270' : 'Web');

export function AppChip({ app, quiet }: { app: { name: string; surface: string }; quiet?: boolean }) {
  const green = app.surface === 'terminal';
  return (
    <span title={connectorName(app.surface)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: 600,
      color: green ? 'var(--green-ink, #0B3D1A)' : 'var(--ink)', background: green ? 'var(--green-bg, #D8F5DF)' : 'var(--panel-2)',
      borderRadius: 3, padding: quiet ? '1px 6px' : '2px 8px', whiteSpace: 'nowrap' }}>
      {green && <span aria-hidden style={{ width: 7, height: 7, borderRadius: '50%', background: '#1F9D4B' }} />}
      {app.name}
    </span>
  );
}

export function Applications({ apps, busy, closed, onEdit }: {
  apps: AgentApplication[]; busy: boolean; closed: boolean;
  onEdit: (verb: string, body: unknown) => Promise<boolean>;
}) {
  const [adding, setAdding] = useState(false);
  const [chosen, setChosen] = useState('');
  const [path, setPath] = useState('/');
  const registered = useFetch<{ applications: Array<{ id: string; name: string; surface: string; retired_at?: string | null }> }>(
    '/api/applications');
  const offered = registered.state === 'loaded'
    ? registered.value.applications.filter((a) => !a.retired_at && !apps.some((x) => x.id === a.id)) : [];
  const pick = offered.find((a) => a.id === chosen);
  const small: React.CSSProperties = { font: 'inherit', fontSize: 12, fontWeight: 600, borderRadius: 3, padding: '3px 10px', cursor: 'pointer',
    color: 'var(--ink)', background: 'transparent', border: '1px solid var(--rule-2)' };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', paddingTop: 12, fontSize: 12.5, color: 'var(--ink-2)' }}>
      <span>Works on</span>
      {apps.map((a) => <AppChip key={a.id} app={a} />)}
      {apps.length > 1 && <span>· each sentence of work says which one it happens on</span>}
      {!closed && !adding && (
        <button type="button" style={small} disabled={busy} onClick={() => setAdding(true)}>Add an application</button>
      )}
      {adding && (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <select aria-label="Application to add" value={chosen} onChange={(e) => setChosen(e.target.value)}
            style={{ font: 'inherit', fontSize: 12.5, padding: '3px 5px', border: '1px solid var(--rule-2)', borderRadius: 3, background: 'var(--panel)' }}>
            <option value="">{registered.state === 'loaded' ? (offered.length ? 'choose one' : 'no other application is registered') : 'loading…'}</option>
            {offered.map((a) => <option key={a.id} value={a.id}>{a.name} — {connectorName(a.surface)}</option>)}
          </select>
          {pick && pick.surface !== 'terminal' && (
            <input aria-label="Where it opens" value={path} onChange={(e) => setPath(e.target.value)} placeholder="/login"
              style={{ font: 'inherit', fontSize: 12.5, width: 90, padding: '3px 6px', border: '1px solid var(--rule-2)', borderRadius: 3 }} />
          )}
          <button type="button" style={{ ...small, color: 'var(--page)', background: 'var(--ink)', border: '1px solid var(--ink)' }}
            disabled={busy || !pick}
            onClick={() => void onEdit('attach-application', { applicationId: chosen, startPath: pick?.surface === 'terminal' ? '/' : path || '/' })
              .then((ok) => { if (ok) { setAdding(false); setChosen(''); } })}>Add</button>
          <button type="button" style={small} onClick={() => setAdding(false)}>Cancel</button>
        </span>
      )}
      {apps.length > 1 && closed && <Chip state="quiet">fixed in this version</Chip>}
    </div>
  );
}
