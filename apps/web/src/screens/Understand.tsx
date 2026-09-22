import { useEffect, useState } from 'react';
import { Action, Page, Refusal, Section } from '../Page.tsx';
import { send } from '../fetching.ts';
import { EmptyState, type Emptiness } from '../ui.tsx';
import type { Route } from '../router.ts';
import { Working } from './BringIn.tsx';

/**
 * What Orbit understood, before anything is drafted (Orbit 2.1).
 *
 * Every sentence of the procedure, in the author's words, with what Orbit will
 * do with it. Nothing is drafted until a person has read this and confirmed
 * it, because the walk is given only the sentences marked as Orbit's — a
 * sentence wrongly sorted as background is a step that silently never exists.
 *
 * The labels are not colour-coded. Colour has five jobs in Orbit and none of
 * them is "what kind of sentence this is"; a label is read, not scanned.
 */

type Label = 'task' | 'rule' | 'forAPerson' | 'background' | 'wontDo';

interface Understanding {
  status: 'queued' | 'sorting' | 'sorted' | 'refused';
  refused: { describe?: string } | null;
  confirmed_at: string | null;
  session_id: string | null;
  walk: string | null;
  name: string;
  application: string;
  sentences: Array<{
    number: string; part: string; text: string; kind: string;
    label: Label | null; reason: string | null; basis: string | null; givenBy: string | null;
  }>;
  coverage: { total: number; placed: number; unplaced: string[]; byLabel: Record<Label, number> };
}

/** Said the way an author thinks of it, and in the order they matter. */
const LABELS: Array<[Label, string, string]> = [
  ['task', 'Orbit does this', 'Something to do in the application.'],
  ['rule', 'A rule', 'A condition that decides what happens.'],
  ['forAPerson', 'For a person', 'Left to a person. Orbit does not do it.'],
  ['background', 'Background', 'Nobody has to do anything.'],
  ['wontDo', 'Orbit won\'t', 'The procedure says not to.'],
];
const NAME = Object.fromEntries(LABELS.map(([l, n]) => [l, n])) as Record<Label, string>;

export function Understand({ id, go }: { id: string; go: (to: Route) => void }) {
  const [state, setState] = useState<{ ok: true; value: Understanding } | { ok: false; of: Emptiness }>(
    { ok: false, of: { kind: 'notLoadedYet' } });
  const [refresh, setRefresh] = useState(0);
  const [refused, setRefused] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [walking, setWalking] = useState<string | null>(null);

  const status = state.ok ? state.value.status : null;
  useEffect(() => {
    let live = true;
    const load = async () => {
      const res = await fetch(`/api/workflows/${id}/understanding`).catch(() => null);
      if (!live) return;
      if (!res) {
        setState({ ok: false, of: { kind: 'couldNotLoad', why: 'Orbit could not be reached. Nothing is lost.' } });
        return;
      }
      if (res.status === 404) { setState({ ok: false, of: { kind: 'nothingMatching', searched: id } }); return; }
      if (!res.ok) { setState({ ok: false, of: { kind: 'couldNotLoad', why: 'The record store did not answer.' } }); return; }
      setState({ ok: true, value: await res.json() });
    };
    void load();
    // Polled only while the worker has it. Once sorted, the page changes when
    // the author changes it, and not otherwise.
    const waiting = status === null || status === 'queued' || status === 'sorting';
    const timer = waiting ? setInterval(() => { void load(); }, 1200) : null;
    return () => { live = false; if (timer) clearInterval(timer); };
  }, [id, refresh, status]);

  if (walking) return <Working id={walking} go={go} onAbandon={() => setWalking(null)} />;

  if (!state.ok) {
    return <Page title="What Orbit understood"><div style={{ marginTop: 18, border: '1px solid var(--rule)',
      borderRadius: 6, background: 'var(--panel)' }}><EmptyState of={state.of} /></div></Page>;
  }

  const u = state.value;
  const sorted = u.status === 'sorted';
  const confirmed = Boolean(u.confirmed_at);
  const complete = u.coverage.placed === u.coverage.total;
  const forOrbit = u.coverage.byLabel.task + u.coverage.byLabel.rule;

  const relabel = async (sentence: string, label: Label) => {
    setBusy(true); setRefused(null);
    const result = await send('/api/workflows/' + id + '/relabel', { sentence, label });
    setBusy(false);
    if (!result.ok) setRefused(result.why);
    setRefresh((n) => n + 1);
  };

  const confirm = async () => {
    setBusy(true); setRefused(null);
    const result = await send<{ id: string }>(`/api/workflows/${id}/understood`, {});
    setBusy(false);
    if (result.ok) setWalking(result.value.id);
    else setRefused(result.why);
  };

  return (
    <Page kicker={confirmed ? 'What Orbit understood' : 'Before anything is drafted'} title={u.name}
      aside={<p style={{ margin: 0, fontSize: 14, lineHeight: 1.55, color: 'var(--ink-2)', maxWidth: 520 }}>
        {u.status === 'queued' ? 'Waiting for a worker to pick this up.'
          : u.status === 'sorting' ? 'Orbit is reading every sentence and saying what it will do with it.'
          : u.status === 'refused' ? 'Orbit could not sort this. Nothing was kept from the attempt.'
          : confirmed ? `Confirmed. Orbit drafted from the sentences marked as its own, against ${u.application}.`
          : 'Check what Orbit will do with each sentence. Change any that are wrong, then confirm.'}
      </p>}
      actions={confirmed
        ? <Action kind="ghost" onClick={() => go({ at: 'agent', id })}>Open the draft</Action>
        : <Action disabled={!sorted || !complete || forOrbit === 0 || busy}
            why={!sorted ? 'Orbit is still sorting'
              : !complete ? `${u.coverage.total - u.coverage.placed} sentences have no label yet`
              : forOrbit === 0 ? 'Nothing is marked for Orbit to do'
              : 'Working'}
            onClick={() => void confirm()}>Confirm and draft it</Action>}>

      {u.status === 'refused' && (
        <Refusal tone="failed" title="This was not sorted"
          blockers={[u.refused?.describe ?? 'No reason was recorded.']} />
      )}
      {refused && <Refusal title="That was not changed" blockers={[refused]} />}
      {confirmed && u.walk && u.walk !== 'brought in' && u.session_id && (
        <Refusal title={u.walk === 'refused' ? 'The draft could not be made' : 'The draft is being made'}
          tone={u.walk === 'refused' ? 'failed' : 'attention'}
          blockers={[u.walk === 'refused'
            ? 'The walk over these sentences did not produce a draft. Open it to see why.'
            : 'Orbit is working through the sentences marked as its own against the application.']} />
      )}

      <Section title="Placed" note={`${u.coverage.placed} of ${u.coverage.total} sentences`}>
        <Coverage coverage={u.coverage} />
      </Section>

      <Section title="The procedure, sentence by sentence"
        note={sorted && !confirmed ? 'change a label and it is kept alongside Orbit\'s, which stays on the record' : undefined}>
        {(u.status === 'queued' || u.status === 'sorting') && (
          <div className="orbit-working" style={{ padding: '4px 0 14px', fontSize: 13.5, color: 'var(--ink-2)' }}>
            {u.status === 'queued' ? 'Waiting for a worker' : 'Sorting'}
            <span style={{ fontFamily: 'var(--mono)' }}>
              <span className="orbit-dot">.</span><span className="orbit-dot">.</span><span className="orbit-dot">.</span>
            </span>
          </div>
        )}
        <div style={{ borderTop: '1px solid var(--ink)' }}>
          {u.sentences.map((s) => (
            <div key={s.number} style={{ display: 'flex', gap: 16, alignItems: 'flex-start',
              borderBottom: '1px solid var(--rule)', padding: '12px 0' }}>
              <span style={{ width: 46, flexShrink: 0, fontFamily: 'var(--mono)', fontSize: 12,
                color: 'var(--ink-2)', paddingTop: 2 }}>{s.number}</span>
              <span style={{ flexGrow: 1, minWidth: 0, fontSize: 14, lineHeight: 1.6, whiteSpace: 'pre-wrap',
                fontWeight: s.kind === 'heading' ? 700 : 400,
                color: s.label === 'background' || s.label === 'wontDo' ? 'var(--ink-2)' : 'var(--ink)' }}>
                {s.text}
              </span>
              <span style={{ width: 300, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 5 }}>
                {s.label === null ? (
                  <span style={{ fontSize: 13, color: 'var(--ink-2)' }}>{sorted ? 'No label' : 'Not sorted yet'}</span>
                ) : sorted && !confirmed ? (
                  <select value={s.label} disabled={busy} aria-label={`What sentence ${s.number} is for`}
                    onChange={(e) => void relabel(s.number, e.target.value as Label)}
                    style={{ font: 'inherit', fontSize: 13.5, fontWeight: 600, padding: '6px 8px',
                      border: '1px solid var(--rule-2)', borderRadius: 3, background: 'var(--panel)', color: 'var(--ink)' }}>
                    {LABELS.map(([l, n]) => <option key={l} value={l}>{n}</option>)}
                  </select>
                ) : (
                  <span style={{ fontSize: 13.5, fontWeight: 600 }}>{NAME[s.label]}</span>
                )}
                {s.reason && (
                  <span style={{ fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.5 }}>
                    {s.givenBy === 'author' ? 'You: ' : s.basis === 'inferred' ? 'Orbit concluded: ' : 'Orbit: '}
                    {s.reason}
                  </span>
                )}
              </span>
            </div>
          ))}
        </div>
      </Section>

      {!confirmed && <Section title="What happens when you confirm">
        <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.65, color: 'var(--ink-2)', maxWidth: 760 }}>
          Orbit works through the sentences marked <strong>Orbit does this</strong> and <strong>A rule</strong> against {u.application},
          in this order and in these words, and drafts the steps. Sentences for a person, and what the procedure
          says not to do, are written onto the draft as decided, so it says what it leaves out.
          Background is kept here and goes nowhere else.
        </p>
      </Section>}
    </Page>
  );
}

function Coverage({ coverage }: { coverage: Understanding['coverage'] }) {
  const { total, placed, byLabel } = coverage;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12, maxWidth: 900 }}>
      <div role="img" aria-label={`${placed} of ${total} sentences placed`}
        style={{ display: 'flex', height: 10, borderRadius: 2, overflow: 'hidden', background: 'var(--panel-2)' }}>
        {/* One ink, in steps of weight: a count, not a status. */}
        {LABELS.map(([l], i) => byLabel[l] > 0 && (
          <span key={l} style={{ width: `${(byLabel[l] / Math.max(total, 1)) * 100}%`, background: 'var(--ink)',
            opacity: 1 - i * 0.17, borderRight: '1px solid var(--page)' }} />
        ))}
      </div>
      <div style={{ display: 'flex', gap: 22, flexWrap: 'wrap', fontSize: 13 }}>
        {LABELS.map(([l, n, what], i) => (
          <span key={l} title={what} style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
            <span aria-hidden="true" style={{ width: 9, height: 9, borderRadius: 1, background: 'var(--ink)', opacity: 1 - i * 0.17 }} />
            <span>{n}</span>
            <span style={{ fontFamily: 'var(--mono)', fontWeight: 600 }}>{byLabel[l]}</span>
          </span>
        ))}
        {placed < total && (
          <span style={{ color: 'var(--ink-2)' }}>
            Not placed <span style={{ fontFamily: 'var(--mono)', fontWeight: 600 }}>{total - placed}</span>
          </span>
        )}
      </div>
    </div>
  );
}
