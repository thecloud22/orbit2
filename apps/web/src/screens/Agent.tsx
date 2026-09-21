import { useState } from 'react';
import { Action, Page, Refusal, Section } from '../Page.tsx';
import { Chip, EmptyState, Row } from '../ui.tsx';
import { send, useFetch } from '../fetching.ts';
import type { Route } from '../router.ts';

interface Draft {
  workflow: { id: string; name: string; procedure: string | null; confirmed_at: string | null;
              live_version_id?: string | null; paused_at?: string | null };
  steps: Array<{ id: string; position: number; kind: string; declares: Record<string, unknown>; complete: boolean }>;
  notes: Array<{ id: string; kind: string; body: string; resolved_at: string | null }>;
  versions: Array<{ version: number; digest: string; published_at: string }>;
  authoring: { turns: Turn[]; producedNothing: number; costMicros: number };
}
interface Turn { turn: number; model: string; verdict: string; why: string;
  /** The model's answer as it came back. `element` is what it named on the
   *  page, and it is shown because Orbit turns that into a binding of its own
   *  — the two disagreeing is the interesting case, and it cannot be seen if
   *  only one of them is on the screen. */
  answered: { why: string; act?: string; element?: string | null; value?: string | null } | null;
  shown: { elements: number }; tokens_in: number; tokens_out: number }

const summary = (d: Record<string, unknown>) => String(d['summary'] ?? '');

/** Decision 14's ten. Offered in the order a procedure tends to use them. */
const KINDS = ['open', 'enter', 'activate', 'read', 'collect', 'check', 'branch', 'forEach', 'handOff', 'end'] as const;

const quiet: React.CSSProperties = {
  font: 'inherit', fontSize: 12, fontFamily: 'var(--mono)', color: 'var(--ink-2)',
  background: 'transparent', border: 0, cursor: 'pointer', padding: '2px 5px', borderRadius: 3,
};
const strategy = (d: Record<string, unknown>) => {
  for (const k of ['region', 'into', 'control', 'table']) {
    const t = d[k] as { binding?: { strategy?: string } } | undefined;
    if (t?.binding?.strategy) return t.binding.strategy;
  }
  return null;
};

/**
 * One agent, and where it is in its life.
 *
 * §4's stage rail: the phases a workflow passes through, each an attributable
 * human act, with the single next action named. Nothing advances on its own,
 * so every stage beyond the current one is a button somebody presses, and each
 * says why it is not available yet rather than being hidden.
 */
export function Agent({ id, go }: { id: string; go: (to: Route) => void }) {
  const [refresh, setRefresh] = useState(0);
  const draft = useFetch<Draft>(`/api/workflows/${id}?r=${refresh}`, id);
  const [refused, setRefused] = useState<string[] | null>(null);
  const [editRefusal, setEditRefusal] = useState<string | null>(null);
  const [adding, setAdding] = useState({ kind: 'read' as string, after: 0 });
  const [showWhy, setShowWhy] = useState(false);
  const [busy, setBusy] = useState(false);

  if (draft.state === 'empty') {
    return <Page title="Agent"><div style={{ marginTop: 18, border: '1px solid var(--rule)',
      borderRadius: 6, background: 'var(--panel)' }}><EmptyState of={draft.of} /></div></Page>;
  }

  const { workflow, steps, notes, versions, authoring } = draft.value;
  const outstanding = notes.filter((n) => !n.resolved_at);
  const published = versions.length > 0;
  const live = Boolean(workflow.live_version_id);

  const act = async (path: string, body: unknown = {}) => {
    setBusy(true); setRefused(null);
    const result = await send<{ blockers?: string[]; unproved?: string[] }>(path, body);
    setBusy(false);
    if (!result.ok) { setRefused([result.why]); return; }
    const value = result.value;
    if (value.blockers?.length) setRefused(value.blockers);
    else if (value.unproved?.length) setRefused(value.unproved.map((u) => `"${u}" has not been proved by a run yet.`));
    else setRefresh((n) => n + 1);
  };

  /**
   * §6's editing, which is a separate conversation from the stage actions
   * above: a refused edit is about the change you just tried, so it is shown
   * against the steps rather than at the top of the page, and it clears the
   * moment you try something else.
   *
   * Editing stops once a version is live. A live agent is running against
   * real applications on a published version, and quietly rewriting the steps
   * under it would break the one thing Orbit claims — that you can say what
   * the agent did. Changing a live agent means publishing again.
   */
  const editable = !live;
  const edit = async (verb: string, body: unknown) => {
    setBusy(true); setEditRefusal(null);
    const result = await send(`/api/workflows/${id}/${verb}`, body);
    setBusy(false);
    if (result.ok) setRefresh((n) => n + 1);
    else setEditRefusal(result.why);
  };

  return (
    <Page
      kicker={live ? 'Active' : published ? 'Published, not yet activated' : workflow.confirmed_at ? 'Confirmed' : 'Draft'}
      title={workflow.name}
      actions={<>
        {!workflow.confirmed_at && (
          <Action kind="ghost" disabled={outstanding.length > 0}
            why={`${outstanding.length} outstanding`}
            onClick={() => void act(`/api/workflows/${id}/confirm`, {
              attested: true, answers: [],
              endings: steps.filter((s) => s.kind === 'end').map((s) => ({
                stepId: s.id, outcome: 'done', label: 'Done', example: { reference: 'example' },
              })),
            })}>Confirm the procedure</Action>
        )}
        {workflow.confirmed_at && !published && (
          <Action disabled={busy} onClick={() => void act(`/api/workflows/${id}/publish`)}>Publish a version</Action>
        )}
        {published && !live && <Action disabled={busy} onClick={() => go({ at: 'agents' })}>Test and activate</Action>}
        {live && <Action onClick={() => go({ at: 'start', version: workflow.live_version_id! })}>Start a run</Action>}
      </>}
    >
      <Stages confirmed={Boolean(workflow.confirmed_at)} published={published} live={live}
        outstanding={outstanding.length} />

      {refused && <Refusal title="Nothing was changed" blockers={refused} />}

      {outstanding.length > 0 && (
        <Refusal title={outstanding.length === 1 ? 'One thing is outstanding' : `${outstanding.length} things are outstanding`}
          blockers={outstanding.map((n) => n.body)} />
      )}

      {workflow.procedure && (
        <Section title="What was written">
          <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.75, maxWidth: 760 }}>{workflow.procedure}</p>
        </Section>
      )}

      <Section title="Steps" note={`${steps.length}`}
        right={<button type="button" onClick={() => setShowWhy((v) => !v)}
          style={{ font: 'inherit', fontSize: 13, fontWeight: 600, color: 'var(--failed-ink)',
            background: 'transparent', border: 0, cursor: 'pointer', padding: 0 }}>
          {showWhy ? 'Hide why it says this' : 'Why does it say this?'}
        </button>}>
        <div style={{ borderTop: '1px solid var(--ink)' }}>
          {steps.map((s, i) => (
            <div key={s.id} style={{ borderBottom: i === steps.length - 1 ? 'none' : '1px solid var(--rule)',
              padding: '11px 0', display: 'flex', alignItems: 'center', gap: 13 }}>
              <span style={{ width: 18, fontSize: 12, color: 'var(--ink-2)', textAlign: 'right' }}>{s.position}</span>
              <span style={{ width: 70, fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 600,
                color: 'var(--running-ink)' }}>{s.kind}</span>
              <span style={{ flexGrow: 1, fontSize: 13.5 }}>{summary(s.declares)}</span>
              {strategy(s.declares) && <span style={{ fontSize: 11.5, color: 'var(--ink-2)',
                fontFamily: 'var(--mono)' }}>by {strategy(s.declares)}</span>}
              {!s.complete && <Chip state="attention">not finished</Chip>}
              {editable && (
                <span style={{ display: 'flex', gap: 1, flexShrink: 0 }}>
                  <button type="button" style={quiet} disabled={i === 0 || busy}
                    title={`Move step ${s.position} earlier`}
                    onClick={() => edit('move-step', { stepId: s.id, to: s.position - 1 })}>↑</button>
                  <button type="button" style={quiet} disabled={i === steps.length - 1 || busy}
                    title={`Move step ${s.position} later`}
                    onClick={() => edit('move-step', { stepId: s.id, to: s.position + 1 })}>↓</button>
                  <button type="button" style={quiet} disabled={busy}
                    title={`Remove step ${s.position}`}
                    onClick={() => edit('delete-step', { stepId: s.id })}>remove</button>
                </span>
              )}
            </div>
          ))}
        </div>

        {editable && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, paddingTop: 13, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13, color: 'var(--ink-2)' }}>Add a</span>
            <select value={adding.kind} disabled={busy} aria-label="Kind of step to add"
              onChange={(e) => setAdding((a) => ({ ...a, kind: e.target.value }))}
              style={{ font: 'inherit', fontSize: 13, fontFamily: 'var(--mono)', padding: '5px 7px',
                border: '1px solid var(--rule-2)', borderRadius: 3, background: 'var(--paper)' }}>
              {KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
            <span style={{ fontSize: 13, color: 'var(--ink-2)' }}>step after</span>
            <select value={adding.after} disabled={busy} aria-label="Where to add the step"
              onChange={(e) => setAdding((a) => ({ ...a, after: Number(e.target.value) }))}
              style={{ font: 'inherit', fontSize: 13, padding: '5px 7px',
                border: '1px solid var(--rule-2)', borderRadius: 3, background: 'var(--paper)' }}>
              <option value={0}>the beginning</option>
              {steps.map((s) => <option key={s.id} value={s.position}>step {s.position} · {s.kind}</option>)}
            </select>
            <Action kind="ghost" disabled={busy}
              onClick={() => edit('insert-step', { kind: adding.kind, after: adding.after })}>Add step</Action>
            <span style={{ fontSize: 12.5, color: 'var(--ink-2)' }}>
              It arrives unfinished, and blocks publication until you configure it.
            </span>
          </div>
        )}

        {editRefusal && (
          <div style={{ paddingTop: 14 }}>
            <Refusal title="That change was not made" blockers={[editRefusal]} />
          </div>
        )}

        {editable && workflow.confirmed_at && (
          <p style={{ fontSize: 12.5, color: 'var(--ink-2)', margin: '13px 0 0' }}>
            This agent is confirmed. Changing a step returns it to draft, and it must be confirmed again.
          </p>
        )}
      </Section>

      {showWhy && (
        <Section title="Why the workflow says this"
          note={`${authoring.turns.length} turns, ${authoring.producedNothing} produced nothing usable`}>
          <div style={{ borderTop: '1px solid var(--ink)' }}>
            {authoring.turns.map((t) => (
              <div key={t.turn} style={{ borderBottom: '1px solid var(--rule)', padding: '13px 0',
                display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                <span style={{ width: 18, fontSize: 12, color: 'var(--ink-2)', textAlign: 'right', paddingTop: 2 }}>{t.turn}</span>
                <span style={{ width: 92, flexShrink: 0 }}>
                  <Chip state={t.verdict === 'kept' ? 'ok' : 'failed'}>{t.verdict}</Chip></span>
                <div style={{ flexGrow: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, marginBottom: 4 }}>{t.why}</div>
                  {t.answered?.element && (
                    <div style={{ fontSize: 12.5, marginBottom: 4 }}>
                      <span style={{ color: 'var(--ink-2)' }}>It named </span>
                      <span style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>{t.answered.element}</span>
                      {t.answered.act && <span style={{ color: 'var(--ink-2)' }}> to {t.answered.act}</span>}
                      {t.answered.value && <>
                        <span style={{ color: 'var(--ink-2)' }}>, as </span>
                        <span style={{ fontFamily: 'var(--mono)', fontSize: 12 }}>{t.answered.value}</span>
                      </>}
                    </div>
                  )}
                  {t.answered && <div style={{ fontSize: 12.5, color: 'var(--ink-2)', fontStyle: 'italic',
                    lineHeight: 1.5 }}>“{t.answered.why}”</div>}
                  <div style={{ fontSize: 11, color: 'var(--ink-2)', fontFamily: 'var(--mono)', marginTop: 5 }}>
                    {t.model} · {t.shown.elements} elements shown · {t.tokens_in}/{t.tokens_out} tokens
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div style={{ paddingTop: 14 }}>
            <Row label="Cost to build">${(authoring.costMicros / 1e6).toFixed(6)}</Row>
          </div>
        </Section>
      )}

      {published && (
        <Section title="Versions" note="a version is a fact; editing the draft does not change one">
          <div style={{ borderTop: '1px solid var(--ink)' }}>
            {versions.map((v) => (
              <div key={v.version} style={{ borderBottom: '1px solid var(--rule)', padding: '11px 0',
                display: 'flex', alignItems: 'center', gap: 16 }}>
                <span style={{ width: 90, fontSize: 13.5, fontWeight: 600 }}>Version {v.version}</span>
                <span style={{ flexGrow: 1, fontFamily: 'var(--mono)', fontSize: 11.5, color: 'var(--ink-2)' }}>
                  {v.digest.replace('sha256:', '').slice(0, 24)}</span>
                <span style={{ fontSize: 12.5, color: 'var(--ink-2)' }}>
                  {new Date(v.published_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
              </div>
            ))}
          </div>
        </Section>
      )}
    </Page>
  );
}

/**
 * §4's stage rail. Every transition is a deliberate human act, so a stage that
 * is not available says why rather than disappearing — §2's rule that a
 * control you cannot use is shown with its reason, never hidden.
 */
function Stages({ confirmed, published, live, outstanding }: {
  confirmed: boolean; published: boolean; live: boolean; outstanding: number;
}) {
  const stages = [
    { name: 'Brought in', done: true, why: '' },
    { name: 'Checked', done: outstanding === 0, why: `${outstanding} outstanding` },
    { name: 'Confirmed', done: confirmed, why: 'nobody has attested to it yet' },
    { name: 'Published', done: published, why: 'confirm it first' },
    { name: 'Active', done: live, why: 'every ending must be proved by a run' },
  ];
  return (
    <div style={{ display: 'flex', gap: 0, paddingTop: 20 }}>
      {stages.map((s, i) => (
        <div key={s.name} style={{ flexGrow: 1, borderTop: `3px solid ${s.done ? 'var(--ok)' : 'var(--rule)'}`,
          paddingTop: 10, paddingRight: 16, marginRight: i === stages.length - 1 ? 0 : 4 }}>
          <div style={{ fontSize: 13, fontWeight: s.done ? 700 : 400,
            color: s.done ? 'var(--ink)' : 'var(--ink-2)' }}>{s.name}</div>
          {!s.done && s.why && <div style={{ fontSize: 11.5, color: 'var(--ink-2)', marginTop: 3 }}>{s.why}</div>}
        </div>
      ))}
    </div>
  );
}
