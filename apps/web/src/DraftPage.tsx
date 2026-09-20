import { useEffect, useState } from 'react';
import { Chip, EmptyState, Row, type Emptiness } from './ui.tsx';

interface Turn {
  turn: number; provider: string; model: string;
  shown: { page: string; elements: number; asking: string };
  answered: { act: string; element: string | null; value: string | null; why: string } | null;
  verdict: 'kept' | 'discarded' | 'rejected';
  why: string; tokens_in: number; tokens_out: number; cost_micros: number;
}
interface Draft {
  workflow: { id: string; name: string; procedure: string | null; confirmed_at: string | null };
  steps: Array<{ id: string; position: number; kind: string; declares: Record<string, unknown>; complete: boolean }>;
  notes: Array<{ id: string; kind: string; body: string; resolved_at: string | null }>;
  versions: Array<{ version: number; digest: string; activated_at: string | null }>;
  authoring: { turns: Turn[]; producedNothing: number; costMicros: number };
}

const summaryOf = (d: Record<string, unknown>) => String(d['summary'] ?? '');
const strategyOf = (d: Record<string, unknown>) => {
  for (const key of ['region', 'into', 'control', 'table']) {
    const t = d[key] as { binding?: { strategy?: string } } | undefined;
    if (t?.binding?.strategy) return t.binding.strategy;
  }
  return null;
};

export function DraftPage({ id }: { id: string }) {
  const [state, setState] = useState<{ kind: 'loaded'; d: Draft } | { kind: 'empty'; of: Emptiness }>(
    { kind: 'empty', of: { kind: 'notLoadedYet' } });
  const [showWhy, setShowWhy] = useState(false);

  useEffect(() => {
    let live = true;
    fetch(`/api/workflows/${id}`)
      .then(async (r) => {
        const body = await r.json();
        if (!live) return;
        setState(r.ok ? { kind: 'loaded', d: body }
          : { kind: 'empty', of: { kind: 'nothingMatching', searched: id } });
      })
      .catch(() => live && setState({ kind: 'empty', of: { kind: 'couldNotLoad',
        why: 'The record store did not answer. Your drafts are unaffected — this screen could not read them.' } }));
    return () => { live = false; };
  }, [id]);

  if (state.kind === 'empty') {
    return <main style={{ maxWidth: 1280, margin: '0 auto', padding: '26px 36px' }}>
      <div style={{ border: '1px solid var(--rule)', borderRadius: 6, background: 'var(--panel)' }}>
        <EmptyState of={state.of} />
      </div>
    </main>;
  }

  const { workflow, steps, notes, authoring, versions } = state.d;
  const outstanding = notes.filter((n) => !n.resolved_at);

  return (
    <main style={{ maxWidth: 1280, margin: '0 auto', padding: '26px 36px 60px' }}>
      <header style={{ display: 'flex', alignItems: 'flex-end', gap: 24, paddingBottom: 18 }}>
        <div style={{ flexGrow: 1 }}>
          <div style={{ fontSize: 13, color: 'var(--ink-2)', marginBottom: 7 }}>
            {workflow.confirmed_at ? 'Confirmed' : 'Draft'}
          </div>
          <h1 style={{ margin: 0, fontSize: 33, fontWeight: 700, letterSpacing: '-0.024em' }}>{workflow.name}</h1>
        </div>
        {versions[0] && <Chip state="ok">Version {versions[0].version} published</Chip>}
      </header>
      <div style={{ height: 2, background: 'var(--ink)' }} />

      {/* Any outstanding item blocks confirmation, with a link to it (§4). */}
      {outstanding.length > 0 && (
        <div style={{ marginTop: 18, background: 'var(--attention-wash)', borderLeft: '3px solid var(--attention)',
          borderRadius: 5, padding: '14px 18px' }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--attention-ink)', marginBottom: 6 }}>
            {outstanding.length === 1 ? 'One thing is outstanding' : `${outstanding.length} things are outstanding`}
          </div>
          {outstanding.map((n) => (
            <div key={n.id} style={{ fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.55 }}>{n.body}</div>
          ))}
        </div>
      )}

      {workflow.procedure && (
        <section style={{ padding: '22px 0 18px', borderBottom: '1px solid var(--rule)' }}>
          <h2 style={{ margin: '0 0 10px', fontSize: 16, fontWeight: 700 }}>What was written</h2>
          <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.75, maxWidth: 760, color: 'var(--ink)' }}>
            {workflow.procedure}
          </p>
        </section>
      )}

      <section style={{ paddingTop: 22 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, paddingBottom: 11 }}>
          <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Steps</h2>
          <span style={{ fontSize: 12.5, color: 'var(--ink-2)' }}>{steps.length}, all validated</span>
          <span style={{ flexGrow: 1 }} />
          <button type="button" onClick={() => setShowWhy((v) => !v)}
            style={{ font: 'inherit', fontSize: 13, fontWeight: 600, color: 'var(--failed-ink)',
              background: 'transparent', border: 0, cursor: 'pointer', padding: 0 }}>
            {showWhy ? 'Hide why it says this' : 'Why does it say this?'}
          </button>
        </div>

        <div style={{ borderTop: '1px solid var(--ink)' }}>
          {steps.map((s, i) => {
            const by = strategyOf(s.declares);
            return (
              <div key={s.id} style={{ borderBottom: i === steps.length - 1 ? 'none' : '1px solid var(--rule)',
                padding: '11px 0', display: 'flex', alignItems: 'center', gap: 13 }}>
                <span style={{ width: 18, fontSize: 12, color: 'var(--ink-2)', textAlign: 'right' }}>{s.position}</span>
                <span style={{ width: 70, fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 600,
                  color: 'var(--running-ink)' }}>{s.kind}</span>
                <span style={{ flexGrow: 1, fontSize: 13.5 }}>{summaryOf(s.declares)}</span>
                {by && <span style={{ fontSize: 11.5, color: 'var(--ink-2)', fontFamily: 'var(--mono)' }}>by {by}</span>}
              </div>
            );
          })}
        </div>
      </section>

      {/* Provenance as evidence, not as a log (§12). It answers the question a
          reviewer actually has, which is not what the screen looked like. */}
      {showWhy && (
        <section style={{ paddingTop: 26 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, paddingBottom: 11 }}>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Why the workflow says this</h2>
            <span style={{ fontSize: 12.5, color: 'var(--ink-2)' }}>
              {authoring.turns.length} turns, {authoring.producedNothing} produced nothing usable
            </span>
          </div>
          <div style={{ borderTop: '1px solid var(--ink)' }}>
            {authoring.turns.map((t) => (
              <div key={t.turn} style={{ borderBottom: '1px solid var(--rule)', padding: '13px 0',
                display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                <span style={{ width: 18, fontSize: 12, color: 'var(--ink-2)', textAlign: 'right', paddingTop: 2 }}>{t.turn}</span>
                <span style={{ width: 92, flexShrink: 0 }}>
                  <Chip state={t.verdict === 'kept' ? 'ok' : 'failed'}>{t.verdict}</Chip>
                </span>
                <div style={{ flexGrow: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, marginBottom: 4 }}>{t.why}</div>
                  {t.answered && (
                    <div style={{ fontSize: 12.5, color: 'var(--ink-2)', fontStyle: 'italic', lineHeight: 1.5 }}>
                      “{t.answered.why}”
                    </div>
                  )}
                  <div style={{ fontSize: 11, color: 'var(--ink-2)', fontFamily: 'var(--mono)', marginTop: 5 }}>
                    {t.model} · {t.shown.elements} elements shown · {t.tokens_in}/{t.tokens_out} tokens
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div style={{ paddingTop: 14, display: 'flex', gap: 30 }}>
            <Row label="Cost to build">${(authoring.costMicros / 1e6).toFixed(6)}</Row>
          </div>
        </section>
      )}
    </main>
  );
}
