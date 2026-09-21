import { useState } from 'react';
import { Action, Page, Refusal, Section } from '../Page.tsx';
import { EmptyState, Row } from '../ui.tsx';
import { send, useFetch } from '../fetching.ts';
import type { Route } from '../router.ts';

interface Needs {
  inputs: Array<{ name: string; label: string; required: boolean }>;
  outcomes: Array<{ name: string; label: string }>;
}

/**
 * The request form, generated from what the version declares (§10).
 *
 * Nothing here is hand-written per agent: the fields are the declared inputs,
 * and values are validated before a run is created — because a run that exists
 * with invalid inputs is a run somebody has to explain later.
 */
export function StartRun({ version, go }: { version: string; go: (to: Route) => void }) {
  const needs = useFetch<Needs>(`/api/versions/${version}`, version);
  const [values, setValues] = useState<Record<string, string>>({});
  const [refused, setRefused] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);

  if (needs.state === 'empty') {
    return <Page title="Start a run"><div style={{ marginTop: 18, border: '1px solid var(--rule)',
      borderRadius: 6, background: 'var(--panel)' }}><EmptyState of={needs.of} /></div></Page>;
  }

  // What the version declares, asked of the version. This used to be the union
  // of the names every test example supplied, which meant the form was built
  // out of values an author had typed rather than out of what the agent asks
  // for — and an input nobody wrote an example for had no field at all.
  const names = needs.value.inputs.map((i) => i.name);

  const start = async () => {
    setBusy(true); setRefused(null);
    const result = await send<{ reference?: string; why?: string; missing?: string[] }>(
      `/api/versions/${version}/runs`, { inputs: values });
    setBusy(false);
    // A refused start says which values are missing, and says it over a
    // non-2xx status. Reading only the status turned that into a number.
    const value = result.ok ? result.value : result.value;
    if (value?.missing?.length) {
      setRefused(value.missing.map((m) => `"${m}" has to be given before this can start.`));
      return;
    }
    if (!result.ok) { setRefused([value?.why ?? result.why]); return; }
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
        {/* The example each ending was given, and whether a test run had
            reached it, used to sit here. Both belonged to a gate that has been
            removed: a version is published and run, and the run is the proof.
            What is left is the fact this section is for — these are the only
            conclusions a run of this version can report. */}
        <div style={{ borderTop: '1px solid var(--ink)' }}>
          {needs.value.outcomes.map((o, i) => (
            <div key={o.name} style={{ borderBottom: i === needs.value.outcomes.length - 1 ? 'none' : '1px solid var(--rule)',
              padding: '12px 0', display: 'flex', alignItems: 'center', gap: 16 }}>
              <span style={{ width: 240, fontSize: 13.5, fontWeight: 600 }}>{o.label}</span>
              <span style={{ flexGrow: 1, fontSize: 12.5, color: 'var(--ink-2)', fontFamily: 'var(--mono)' }}>
                {o.name}
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
