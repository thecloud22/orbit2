import { useState } from 'react';
import { Action, Page, Refusal, Section } from '../Page.tsx';
import { EmptyState, Row } from '../ui.tsx';
import { send, useFetch } from '../fetching.ts';
import type { Route } from '../router.ts';

interface TestCase { outcome: string; label: string; example: Record<string, string>;
  provedBy: { reference: string } | null }

/**
 * The request form, generated from what the version declares (§10).
 *
 * Nothing here is hand-written per agent: the fields are the declared inputs,
 * and values are validated before a run is created — because a run that exists
 * with invalid inputs is a run somebody has to explain later.
 */
export function StartRun({ version, go }: { version: string; go: (to: Route) => void }) {
  const tests = useFetch<TestCase[]>(`/api/versions/${version}/tests`, version);
  const [values, setValues] = useState<Record<string, string>>({});
  const [refused, setRefused] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);

  if (tests.state === 'empty') {
    return <Page title="Start a run"><div style={{ marginTop: 18, border: '1px solid var(--rule)',
      borderRadius: 6, background: 'var(--panel)' }}><EmptyState of={tests.of} /></div></Page>;
  }

  // The declared inputs are the union of the names every example supplies —
  // the author's own values, given when they confirmed.
  const names = [...new Set(tests.value.flatMap((t) => Object.keys(t.example)))];

  const start = async () => {
    setBusy(true); setRefused(null);
    const result = await send<{ reference?: string; why?: string; missing?: string[] }>(
      `/api/versions/${version}/runs`, { inputs: values });
    setBusy(false);
    if (!result.ok) { setRefused([result.why]); return; }
    if (result.value.reference) go({ at: 'run', reference: result.value.reference });
    else setRefused([result.value.why ?? 'That did not work.']);
  };

  return (
    <Page kicker="An operator starts the work" title="Start a run"
      actions={<Action disabled={busy} onClick={() => void start()}>Start the run</Action>}>
      {refused && <Refusal title="No run was created" blockers={refused} tone="failed" />}

      <Section title="What it needs" note="built from the values this version declares">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 18, maxWidth: 520 }}>
          {names.length === 0 && (
            <div style={{ fontSize: 13.5, color: 'var(--ink-2)' }}>This version declares no inputs.</div>
          )}
          {names.map((name) => (
            <div key={name}>
              <label htmlFor={name} style={{ display: 'block', fontSize: 13.5, fontWeight: 600, marginBottom: 7 }}>
                {name}
              </label>
              <input id={name} value={values[name] ?? ''}
                onChange={(e) => setValues((v) => ({ ...v, [name]: e.target.value }))}
                style={{ width: '100%', font: 'inherit', fontFamily: 'var(--mono)', fontSize: 14,
                  color: 'var(--ink)', background: 'var(--panel)', border: '1px solid var(--rule-2)',
                  borderRadius: 3, padding: '10px 12px', boxSizing: 'border-box' }} />
            </div>
          ))}
        </div>
      </Section>

      <Section title="It can end in one of these ways"
        note="fixed when this version was published; a run cannot invent another">
        <div style={{ borderTop: '1px solid var(--ink)' }}>
          {tests.value.map((t, i) => (
            <div key={t.outcome} style={{ borderBottom: i === tests.value.length - 1 ? 'none' : '1px solid var(--rule)',
              padding: '12px 0', display: 'flex', alignItems: 'center', gap: 16 }}>
              <span style={{ width: 240, fontSize: 13.5, fontWeight: 600 }}>{t.label}</span>
              <span style={{ flexGrow: 1, fontSize: 12.5, color: 'var(--ink-2)', fontFamily: 'var(--mono)' }}>
                {Object.entries(t.example).map(([k, v]) => `${k}=${v}`).join(' ') || '—'}
              </span>
              <span style={{ fontSize: 12.5, color: 'var(--ink-2)' }}>
                {t.provedBy ? `proved by ${t.provedBy.reference}` : 'not proved yet'}
              </span>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Before you start it">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 700 }}>
          <Row label="It will not">
            <span style={{ color: 'var(--ok-ink)', fontWeight: 600 }}>Change anything.</span>{' '}
            This version has no authority to write.
          </Row>
          <Row label="Attribution"><span style={{ color: 'var(--ink-2)' }}>
            Not recorded yet. Who started this run will be, when sign-in is built.</span></Row>
        </div>
      </Section>
    </Page>
  );
}
