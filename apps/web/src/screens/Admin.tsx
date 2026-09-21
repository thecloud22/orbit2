import { useState } from 'react';
import { Action, Page, Refusal, Section } from '../Page.tsx';
import { Chip, EmptyState, Row } from '../ui.tsx';
import { send, useFetch } from '../fetching.ts';

interface Application {
  id: string; name: string; surface: string; revision: number;
  addresses: Array<{ host: string; pathPrefix: string }>; sign_in_as: string | null;
  credential_name: string | null; credential_set: boolean; retired_at: string | null;
}

interface Admin {
  applications: Application[];
  spend: { building: string; running: string; calls: string; model: string | null };
  perAgent: Array<{ id: string; name: string; cost_micros: string; calls: number }>;
  deployment: { runsOn: string; region: string | null; recordStore: string; evidence: string;
    environments: string; provider: string | null; model: string | null };
}

const money = (micros: string) => `$${(Number(micros) / 1e6).toFixed(6)}`;

export function AdminScreen() {
  const [refresh, setRefresh] = useState(0);
  const admin = useFetch<Admin>(`/api/admin?r=${refresh}`);
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  if (admin.state === 'empty') {
    return <Page title="Admin"><div style={{ marginTop: 18, border: '1px solid var(--rule)',
      borderRadius: 6, background: 'var(--panel)' }}><EmptyState of={admin.of} /></div></Page>;
  }
  const { applications, spend, perAgent, deployment } = admin.value;

  const onRegistered = () => { setAdding(false); setRefresh((n) => n + 1); };
  const onEdited = () => { setEditingId(null); setRefresh((n) => n + 1); };

  return (
    <Page title="Admin"
      aside={<p style={{ margin: 0, fontSize: 14, lineHeight: 1.55, color: 'var(--ink-2)', maxWidth: 560 }}>
        Everything an agent can reach is registered here first. An author picks from this list and cannot add to it.
      </p>}>
      <Section title="Applications"
        right={<Action kind="ghost" onClick={() => { setEditingId(null); setAdding((v) => !v); }}>
          {adding ? 'Cancel' : 'Register an application'}
        </Action>}>
        {adding && (
          <div style={{ marginBottom: 18, border: '1px solid var(--rule)', borderRadius: 6,
            background: 'var(--panel)', padding: '18px 20px' }}>
            <ApplicationForm mode="register" onDone={onRegistered} onCancel={() => setAdding(false)} />
          </div>
        )}
        <div style={{ borderTop: '1px solid var(--ink)' }}>
          {applications.map((a, i) => (
            <div key={a.id} style={{ borderBottom: i === applications.length - 1 ? 'none' : '1px solid var(--rule)',
              padding: '14px 0' }}>
              {editingId === a.id ? (
                <div style={{ border: '1px solid var(--rule)', borderRadius: 6, background: 'var(--panel-2)',
                  padding: '18px 20px' }}>
                  <ApplicationForm mode="edit" application={a} onDone={onEdited} onCancel={() => setEditingId(null)} />
                </div>
              ) : (
                <div style={{ display: 'flex', gap: 18, alignItems: 'flex-start' }}>
                  <div style={{ width: 180 }}>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>{a.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--ink-2)' }}>{a.surface}, revision {a.revision}</div>
                    {a.retired_at && <div style={{ fontSize: 12, color: 'var(--attention-ink)' }}>retired</div>}
                  </div>
                  <span style={{ width: 260, fontFamily: 'var(--mono)', fontSize: 11.5, color: 'var(--ink-2)',
                    wordBreak: 'break-all' }}>
                    {a.addresses.map((h) => `${h.host}${h.pathPrefix}`).join(' ')}
                  </span>
                  <span style={{ width: 130, display: 'flex', flexDirection: 'column', gap: 2 }}>
                    <span style={{ fontSize: 10, color: 'var(--ink-2)', textTransform: 'uppercase',
                      letterSpacing: '0.02em' }}>Signs in as</span>
                    <span style={{ fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--ink-2)' }}>
                      {a.sign_in_as ?? '—'}</span>
                  </span>
                  <div style={{ flexGrow: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {/* The name a password is filed under is Orbit's
                        bookkeeping. What a person needs to know is whether
                        there is one. */}
                    <Chip state={a.credential_set ? 'ok' : 'failed'}>
                      {a.credential_set ? 'Password set' : 'No password. Runs are refused.'}</Chip>
                  </div>
                  <Action kind="ghost" onClick={() => { setAdding(false); setEditingId(a.id); }}>Edit</Action>
                </div>
              )}
            </div>
          ))}
        </div>
      </Section>

      <div style={{ display: 'flex', gap: 26, paddingTop: 26 }}>
        <Card title="Model, and what it has cost">
          <Row label="Provider">{deployment.provider ?? '—'}</Row>
          <Row label="Model"><span style={{ fontFamily: 'var(--mono)' }}>{deployment.model ?? '—'}</span></Row>
          <div style={{ borderTop: '1px solid var(--rule)', marginTop: 12, paddingTop: 12,
            display: 'flex', flexDirection: 'column', gap: 9 }}>
            <Figure value={money(spend.building)} label="spent building agents" />
            <Figure value={money(spend.running)} label="spent running them" />
            <p style={{ margin: 0, fontSize: 12, color: 'var(--ink-2)', lineHeight: 1.5 }}>
              Running costs nothing because no model is consulted during a run. Every authoring call is
              metered, including the ones that came back unusable.
            </p>
          </div>
        </Card>

        <Card title="Deployment">
          <Row label="Runs on"><span style={{ fontFamily: 'var(--mono)' }}>{deployment.runsOn}</span></Row>
          <Row label="Region">{deployment.region ?? <span style={{ color: 'var(--ink-2)' }}>
            None yet. AWS when production lands.</span>}</Row>
          <Row label="Record store"><span style={{ fontFamily: 'var(--mono)' }}>{deployment.recordStore}</span></Row>
          <Row label="Environments"><span style={{ color: 'var(--ink-2)' }}>{deployment.environments}</span></Row>
          <p style={{ margin: '12px 0 0', fontSize: 12, color: 'var(--ink-2)', lineHeight: 1.5 }}>
            Shown as it actually is. A region is not displayed until something runs in one.
          </p>
        </Card>

        <Card title="What each agent cost to build">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
            {perAgent.map((a) => (
              <div key={a.id} style={{ display: 'flex', gap: 12, fontSize: 13 }}>
                <span style={{ flexGrow: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap' }}>{a.name}</span>
                <span style={{ fontFamily: 'var(--mono)', color: 'var(--ink-2)' }}>{money(a.cost_micros)}</span>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div style={{ marginTop: 26, background: 'var(--nav)', borderRadius: 6, padding: '24px 28px' }}>
        <h2 style={{ margin: '0 0 9px', fontSize: 19, fontWeight: 700, letterSpacing: '-0.012em',
          color: 'var(--page)' }}>Nothing ever reads a credential's value back</h2>
        <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.6, color: '#9C9C96', maxWidth: 640 }}>
          Registering an application records a contract: where the system is, who signs in, and{' '}
          <em style={{ color: 'var(--primary)', fontStyle: 'normal', fontWeight: 600 }}>what the credential
          is called</em>. A value typed in beside it is encrypted before it is written and filed under that
          name, separately from the application. No screen, response or export ever includes it again — Orbit
          tells you whether a named credential is set; it never tells anyone what it is.
        </p>
      </div>
    </Page>
  );
}

const field: React.CSSProperties = {
  font: 'inherit', fontSize: 13.5, padding: '8px 10px', width: '100%', boxSizing: 'border-box',
  border: '1px solid var(--rule-2)', borderRadius: 4, background: 'var(--panel)', color: 'var(--ink)',
};
const label: React.CSSProperties = { fontSize: 12.5, color: 'var(--ink-2)', width: 130, flexShrink: 0 };

/**
 * Registering an application and editing one share a form, because they share
 * everything but two things: registering asks for a surface and edits an
 * empty slate, editing does neither. Decision 5 fixes the surface the moment
 * an application is registered — it decides which step kinds and locator
 * rules apply — so an edit never offers to change it.
 */
function ApplicationForm({ mode, application, onDone, onCancel }: {
  mode: 'register' | 'edit'; application?: Application; onDone: () => void; onCancel: () => void;
}) {
  const [name, setName] = useState(application?.name ?? '');
  const [surface, setSurface] = useState<'browser' | 'terminal'>(
    (application?.surface as 'browser' | 'terminal') ?? 'browser');
  const [addresses, setAddresses] = useState(
    application?.addresses.length ? application.addresses.map((a) => ({ ...a })) : [{ host: '', pathPrefix: '/' }]);
  const [signInAs, setSignInAs] = useState(application?.sign_in_as ?? '');
  const [credentialValue, setCredentialValue] = useState('');
  const [showCredentialValue, setShowCredentialValue] = useState(false);
  const [busy, setBusy] = useState(false);
  const [refused, setRefused] = useState<string | null>(null);

  const usableAddresses = addresses.filter((a) => a.host.trim());
  const ready = name.trim().length > 0 && usableAddresses.length > 0;

  async function submit() {
    setBusy(true); setRefused(null);
    const body = {
      name: name.trim(),
      ...(mode === 'register' ? { surface } : {}),
      addresses: usableAddresses.map((a) => ({ host: a.host.trim(), pathPrefix: a.pathPrefix.trim() || '/' })),
      ...(signInAs.trim() ? { signInAs: signInAs.trim() } : {}),
      ...(credentialValue ? { credentialValue } : {}),
    };
    const result = mode === 'register'
      ? await send('/api/applications', body)
      : await send(`/api/applications/${application!.id}/edit`, body);
    setBusy(false);
    if (result.ok) onDone();
    else setRefused(result.why);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 11, maxWidth: 640 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
        <span style={label}>Name</span>
        <input style={field} value={name} onChange={(e) => setName(e.target.value)}
          aria-label="Application name" placeholder="Loan Servicing Portal" />
      </div>

      {mode === 'register' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
          <span style={label}>Surface</span>
          <div style={{ display: 'flex', gap: 16 }}>
            {(['browser', 'terminal'] as const).map((s) => (
              <label key={s} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13 }}>
                <input type="radio" name="surface" checked={surface === s} onChange={() => setSurface(s)} />
                {s}
              </label>
            ))}
          </div>
        </div>
      )}
      {mode === 'edit' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
          <span style={label}>Surface</span>
          <span style={{ fontSize: 13, color: 'var(--ink-2)' }}>
            {application!.surface} — fixed when it was registered
          </span>
        </div>
      )}

      <div style={{ display: 'flex', gap: 11 }}>
        <span style={{ ...label, paddingTop: 8 }}>Addresses</span>
        <div style={{ flexGrow: 1, display: 'flex', flexDirection: 'column', gap: 7 }}>
          {addresses.map((a, i) => (
            <div key={i} style={{ display: 'flex', gap: 8 }}>
              <input style={{ ...field, maxWidth: 220 }} value={a.host} placeholder="portal.example.internal:443"
                aria-label={`Host ${i + 1}`}
                onChange={(e) => setAddresses((v) => v.map((x, j) => j === i ? { ...x, host: e.target.value } : x))} />
              <input style={{ ...field, maxWidth: 140 }} value={a.pathPrefix} placeholder="/"
                aria-label={`Path prefix ${i + 1}`}
                onChange={(e) => setAddresses((v) => v.map((x, j) => j === i ? { ...x, pathPrefix: e.target.value } : x))} />
              {addresses.length > 1 && (
                <button type="button" onClick={() => setAddresses((v) => v.filter((_, j) => j !== i))}
                  style={{ font: 'inherit', fontSize: 12, color: 'var(--ink-2)', background: 'transparent',
                    border: 0, cursor: 'pointer' }}>remove</button>
              )}
              {i === addresses.length - 1 && (
                <button type="button" onClick={() => setAddresses((v) => [...v, { host: '', pathPrefix: '/' }])}
                  style={{ font: 'inherit', fontSize: 12, color: 'var(--ink-2)', background: 'transparent',
                    border: 0, cursor: 'pointer' }}>another</button>
              )}
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
        <span style={label}>Signs in as</span>
        <input style={{ ...field, maxWidth: 260 }} value={signInAs} onChange={(e) => setSignInAs(e.target.value)}
          aria-label="Signs in as" placeholder="svc_account" />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
        <span style={label}>Password</span>
        <input type={showCredentialValue ? 'text' : 'password'} style={{ ...field, maxWidth: 260 }}
          value={credentialValue} onChange={(e) => setCredentialValue(e.target.value)} autoComplete="new-password"
          aria-label="Password"
          placeholder={mode === 'edit' && application?.credential_set ? 'Leave blank to keep the current value' : ''} />
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--ink-2)' }}>
          <input type="checkbox" checked={showCredentialValue}
            onChange={(e) => setShowCredentialValue(e.target.checked)} />
          show
        </label>
      </div>

      <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--ink-2)', lineHeight: 1.5, maxWidth: 560 }}>
        {/* This described the old arrangement, where the name a password was
            filed under was typed on this form and could be shared between
            applications. It is now derived from the application, so the text
            said the opposite of what happens. */}
        Encrypted the moment you save, and kept for this application alone. Nothing ever reads it
        back — not this page, not the audit trail, not a run. All anyone can see afterwards is
        whether one is set.
      </p>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingTop: 4 }}>
        <Action disabled={!ready || busy}
          why={!name.trim() ? 'Give it a name' : 'It needs at least one address'}
          onClick={() => void submit()}>
          {mode === 'register' ? 'Register' : 'Save'}
        </Action>
        <Action kind="ghost" onClick={onCancel}>Cancel</Action>
      </div>
      {refused && <Refusal title={mode === 'register' ? 'Not registered' : 'Not saved'} blockers={[refused]} />}
    </div>
  );
}

const Card = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div style={{ flexGrow: 1, flexBasis: 0, border: '1px solid var(--rule)', borderRadius: 6,
    background: 'var(--panel)', padding: '18px 20px' }}>
    <h3 style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 700 }}>{title}</h3>
    <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>{children}</div>
  </div>
);
const Figure = ({ value, label }: { value: string; label: string }) => (
  <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
    <span style={{ fontFamily: 'var(--mono)', fontSize: 20, fontWeight: 600 }}>{value}</span>
    <span style={{ fontSize: 12.5, color: 'var(--ink-2)' }}>{label}</span>
  </div>
);
