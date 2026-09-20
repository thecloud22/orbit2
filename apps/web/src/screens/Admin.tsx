import { Page, Section } from '../Page.tsx';
import { Chip, EmptyState, Row } from '../ui.tsx';
import { useFetch } from '../fetching.ts';

interface Admin {
  applications: Array<{ id: string; name: string; surface: string; revision: number;
    addresses: Array<{ host: string; pathPrefix: string }>; sign_in_as: string | null;
    credential_name: string | null; credential_set: boolean; retired_at: string | null }>;
  spend: { building: string; running: string; calls: string; model: string | null };
  perAgent: Array<{ id: string; name: string; cost_micros: string; calls: number }>;
  deployment: { runsOn: string; region: string | null; recordStore: string; evidence: string;
    environments: string; provider: string | null; model: string | null };
}

const money = (micros: string) => `$${(Number(micros) / 1e6).toFixed(6)}`;

export function AdminScreen() {
  const admin = useFetch<Admin>('/api/admin');
  if (admin.state === 'empty') {
    return <Page title="Admin"><div style={{ marginTop: 18, border: '1px solid var(--rule)',
      borderRadius: 6, background: 'var(--panel)' }}><EmptyState of={admin.of} /></div></Page>;
  }
  const { applications, spend, perAgent, deployment } = admin.value;

  return (
    <Page title="Admin"
      aside={<p style={{ margin: 0, fontSize: 14, lineHeight: 1.55, color: 'var(--ink-2)', maxWidth: 560 }}>
        Everything an agent can reach is registered here first. An author picks from this list and cannot add to it.
      </p>}>
      <Section title="Applications">
        <div style={{ borderTop: '1px solid var(--ink)' }}>
          {applications.map((a, i) => (
            <div key={a.id} style={{ borderBottom: i === applications.length - 1 ? 'none' : '1px solid var(--rule)',
              padding: '14px 0', display: 'flex', gap: 18, alignItems: 'flex-start' }}>
              <div style={{ width: 180 }}>
                <div style={{ fontSize: 14, fontWeight: 600 }}>{a.name}</div>
                <div style={{ fontSize: 12, color: 'var(--ink-2)' }}>{a.surface}, revision {a.revision}</div>
              </div>
              <span style={{ width: 300, fontFamily: 'var(--mono)', fontSize: 11.5, color: 'var(--ink-2)',
                wordBreak: 'break-all' }}>
                {a.addresses.map((h) => `${h.host}${h.pathPrefix}`).join(' ')}
              </span>
              <span style={{ width: 130, fontFamily: 'var(--mono)', fontSize: 12, color: 'var(--ink-2)' }}>
                {a.sign_in_as ?? '—'}</span>
              <div style={{ flexGrow: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>{a.credential_name ?? '—'}</span>
                <Chip state={a.credential_set ? 'ok' : 'failed'}>
                  {a.credential_set ? 'Set by the deployment' : 'Not set. Runs are refused.'}</Chip>
              </div>
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
          color: 'var(--page)' }}>There is no password field on this page</h2>
        <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.6, color: '#9C9C96', maxWidth: 640 }}>
          Registering an application records a contract: where the system is, who signs in, and{' '}
          <em style={{ color: 'var(--primary)', fontStyle: 'normal', fontWeight: 600 }}>what the credential
          is called</em>. The value is supplied to the deployment separately. Orbit tells you whether a named
          credential is set; it never tells anyone what it is.
        </p>
      </div>
    </Page>
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
