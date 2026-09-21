import { useEffect, useState } from 'react';
import { describeBinding } from '@orbit/contract';
import { Action, Page, Refusal, Section } from '../Page.tsx';
import { Chip, EmptyState, Row } from '../ui.tsx';
import { send as send2, useFetch } from '../fetching.ts';
import type { Route } from '../router.ts';

interface Draft {
  workflow: { id: string; name: string; procedure: string | null; confirmed_at: string | null;
              declared_inputs: Array<{ name: string; label: string; required: boolean }>;
              live_version_id?: string | null; paused_at?: string | null };
  steps: Array<{ id: string; position: number; kind: string; declares: Record<string, unknown>; complete: boolean }>;
  notes: Array<{ id: string; kind: string; body: string; answer: string | null; resolved_at: string | null }>;
  versions: Array<{ id: string; version: number; digest: string; published_at: string }>;
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

/** The one thing on the page this step acts on, if it acts on one. */
const targetOf = (d: Record<string, unknown>): { label: string; binding: unknown } | null => {
  for (const k of ['region', 'into', 'control', 'table']) {
    const t = d[k] as { label?: string; binding?: unknown } | undefined;
    if (t?.label) return { label: t.label, binding: t.binding };
  }
  return null;
};

const ref = (r: unknown): string => {
  const v = r as { from?: string; value?: string; literal?: Record<string, unknown> };
  if (v?.from === 'step') return `the ${v.value} this run read`;
  if (v?.from === 'input') return `the ${v.value} the run was started with`;
  if (v?.from === 'account') return 'the account this application is registered to sign in as';
  if (v?.from === 'secret') return 'the password registered for this application';
  if (v?.from === 'literal') {
    const l = v.literal ?? {};
    return String(l['text'] ?? l['number'] ?? l['date'] ?? (l['yesNo'] ? 'yes' : 'no'));
  }
  return 'nothing';
};

const OPERATORS: Record<string, string> = {
  is: 'is', isNot: 'is not', contains: 'contains', startsWith: 'starts with',
  isMoreThan: 'is more than', isAtLeast: 'is at least',
  isLessThan: 'is less than', isAtMost: 'is at most',
  isBefore: 'is before', isAfter: 'is after',
  isAbsent: 'was not there', isNotAbsent: 'was there',
};

/**
 * What a step will actually do, in one paragraph.
 *
 * The list showed "by structural", which names a rung of Decision 15's ladder
 * and tells a reader nothing about what gets touched. Orbit's claim is that
 * you can say what the agent did and be sure it could not have done anything
 * else; the second half of that is unreadable unless the binding is legible.
 */
function Detail({ step }: { step: Draft['steps'][number] }) {
  const d = step.declares;
  const target = targetOf(d);
  const lines: Array<[string, React.ReactNode]> = [];

  if (target) lines.push(['Finds', describeBinding(target.binding)]);

  if (step.kind === 'open') lines.push(['Goes to', String(d['path'] ?? '')]);
  if (step.kind === 'enter') lines.push(['Puts in', ref(d['value'])]);
  if (step.kind === 'read') {
    const p = d['produces'] as { name?: string; type?: string; required?: boolean } | undefined;
    lines.push(['Keeps it as', `${p?.name} (${p?.type})${p?.required ? '' : ', and may legitimately find nothing'}`]);
  }
  if (step.kind === 'branch' || step.kind === 'check') {
    const c = (step.kind === 'branch' ? d['when'] : d['that']) as
      { of?: string; operator?: string; left?: unknown; right?: unknown } | undefined;
    lines.push(['Compares', `${ref(c?.left)} ${OPERATORS[c?.operator ?? ''] ?? c?.operator} `
      + (c?.of === 'absence' ? '' : ref(c?.right))]);
  }
  if (step.kind === 'end') {
    const publishes = (d['publishes'] as string[] | undefined) ?? [];
    lines.push(['Reports', String(d['outcome'] ?? '')]);
    if (publishes.length) lines.push(['Carrying', publishes.join(', ')]);
  }
  if (d['changesARecord'] !== undefined) {
    lines.push(['Changes a record', d['changesARecord']
      ? 'Yes — this commits something a person would have to undo'
      : 'No']);
  }

  return (
    <div style={{ padding: '2px 0 13px 101px', display: 'flex', flexDirection: 'column', gap: 5 }}>
      {lines.map(([label, body]) => (
        <div key={label} style={{ display: 'flex', gap: 12, fontSize: 12.5, lineHeight: 1.5 }}>
          <span style={{ width: 130, flexShrink: 0, color: 'var(--ink-2)' }}>{label}</span>
          <span style={{ color: label === 'Changes a record' && d['changesARecord']
            ? 'var(--failed-ink)' : 'var(--ink)' }}>{body}</span>
        </div>
      ))}
    </div>
  );
}

/**
 * Which side of a branch each step sits on.
 *
 * Without this the two endings of a branch read as steps 6 and 7 — one after
 * the other — when reaching either means never reaching the other. A list is
 * the right shape for a procedure that is mostly a sequence, but it has to
 * stop lying at the point where the sequence forks.
 */
function sidesOf(steps: Draft['steps']): Map<string, 'yes' | 'no'> {
  const side = new Map<string, 'yes' | 'no'>();
  for (const s of steps) {
    if (s.kind !== 'branch') continue;
    const d = s.declares as { ifTrue?: string; ifFalse?: string };
    if (d.ifTrue) side.set(d.ifTrue, 'yes');
    if (d.ifFalse) side.set(d.ifFalse, 'no');
  }
  return side;
}

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

const field: React.CSSProperties = {
  font: 'inherit', fontSize: 13.5, padding: '8px 10px', width: '100%', boxSizing: 'border-box',
  border: '1px solid var(--rule-2)', borderRadius: 3, background: 'var(--panel)', color: 'var(--ink)',
};

/**
 * The confirmation stage: the one human act slice 1 records.
 *
 * §4 calls confirmation an attestation that this is the procedure, and it is
 * the gate publication now insists on. Two things had to be real for it to
 * mean anything.
 *
 * A question was answered by citing its id, so it went resolved with no record
 * of what was decided — which is how a version came to be published with its
 * conclusion named "unnamed". An answer is now something somebody wrote.
 *
 * And the endings were confirmed with `outcome: 'done'` and an example of
 * `{ reference: 'example' }`, invented by the screen. Those examples are what
 * the tests before activation run with (§4), so fabricating them made
 * activation a gate on evidence produced from made-up input. They are asked
 * for, per declared input, per ending.
 */
function Confirm({ draft, onDone }: {
  draft: Draft; onDone: (path: string, body: unknown) => Promise<void>;
}) {
  const { workflow, steps, notes } = draft;
  const outstanding = notes.filter((n) => !n.resolved_at);
  const sides = sidesOf(steps);
  const endings = steps.filter((s) => s.kind === 'end');
  const inputs = workflow.declared_inputs ?? [];

  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [acknowledged, setAcknowledged] = useState<Record<string, boolean>>({});
  const settled = (n: { id: string; kind: string }) =>
    n.kind === 'risk' ? Boolean(acknowledged[n.id]) : Boolean(answers[n.id]?.trim());
  const [named, setNamed] = useState<Record<string, { outcome: string; label: string }>>(
    Object.fromEntries(endings.map((e) => {
      const already = String((e.declares as { outcome?: string }).outcome ?? '');
      // "unnamed" is what authoring writes when it could not work out what the
      // conclusion is called. It is a placeholder to replace, not a name.
      return [e.id, { outcome: already === 'unnamed' ? '' : already, label: '' }];
    })));

  // A procedure that reaches no conclusion is not one, and the server refuses
  // to record an attestation to it. Said here too, because the useful moment
  // to learn it is before you press the button that carries your name.
  const noEnding = endings.length === 0;

  const missing = [
    ...(noEnding ? ['a conclusion for this workflow to reach'] : []),
    ...outstanding.filter((n) => !settled(n)).map((n) =>
      n.kind === 'risk' ? 'an acknowledgement' : 'an answer'),
    ...endings.filter((e) => !named[e.id]?.outcome.trim()).map(() => 'a name for a conclusion'),
  ];

  return (
    <Section title="Confirm this is the procedure"
      note="Nothing here is filled in for you. What you write is the record.">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 22, paddingTop: 4, maxWidth: 780 }}>

        {noEnding && (
          <Refusal title="There is nothing here to attest to"
            blockers={['This workflow reaches no conclusion, so there is nothing a run could report or a test could prove. Add an ending before confirming it.']} />
        )}

        {/* A question is answered, a risk is acknowledged. §4 names four kinds
            and four different acts, and a caution shown with a text box under
            it asks for prose that does not exist — whatever gets typed lets
            somebody past a warning that typing cannot address. */}
        {outstanding.map((n) => (
          <div key={n.id}>
            <div style={{ fontSize: 13.5, marginBottom: 6 }}>{n.body}</div>
            {n.kind === 'risk' ? (
              <label style={{ display: 'flex', gap: 9, alignItems: 'flex-start', fontSize: 13,
                color: 'var(--ink-2)', cursor: 'pointer' }}>
                <input type="checkbox" checked={Boolean(acknowledged[n.id])} aria-label={n.body}
                  onChange={(e) => setAcknowledged((a) => ({ ...a, [n.id]: e.target.checked }))}
                  style={{ marginTop: 2 }} />
                <span>I have read this and it is still the procedure.</span>
              </label>
            ) : (
              <input style={field} value={answers[n.id] ?? ''} placeholder="Your answer"
                aria-label={n.body}
                onChange={(e) => setAnswers((a) => ({ ...a, [n.id]: e.target.value }))} />
            )}
          </div>
        ))}

        {endings.map((e, i) => (
          <div key={e.id} style={{ borderTop: '1px solid var(--rule)', paddingTop: 16 }}>
            <div style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 3 }}>
              Conclusion {i + 1}: {summary(e.declares)}
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--ink-2)', marginBottom: 9 }}>
              A run reports this by name, so nothing may invent one.
            </div>
            <div style={{ display: 'flex', gap: 9, marginBottom: 11 }}>
              <input style={field} value={named[e.id]?.outcome ?? ''} aria-label={`Name for conclusion ${i + 1}`}
                placeholder="aShortName"
                onChange={(ev) => setNamed((n) => ({ ...n, [e.id]: { outcome: ev.target.value, label: n[e.id]?.label ?? '' } }))} />
              {/* Its own summary, not an example borrowed from another
                  workflow — "Note rate recorded" under "Loan Declined" reads
                  like a value somebody left behind. */}
              <input style={field} value={named[e.id]?.label ?? ''} aria-label={`Label for conclusion ${i + 1}`}
                placeholder={summary(e.declares)}
                onChange={(ev) => setNamed((n) => ({ ...n, [e.id]: { outcome: n[e.id]?.outcome ?? '', label: ev.target.value } }))} />
            </div>
          </div>
        ))}

        <div style={{ display: 'flex', alignItems: 'center', gap: 11, borderTop: '1px solid var(--rule)', paddingTop: 15 }}>
          <Action disabled={missing.length > 0}
            why={`Still needed: ${[...new Set(missing)].join(', ')}`}
            onClick={() => void onDone(`/api/workflows/${workflow.id}/confirm`, {
              attested: true,
              answers: outstanding.map((n) => ({
                noteId: n.id,
                answer: answers[n.id] ?? '',
                acknowledged: Boolean(acknowledged[n.id]),
              })),
              endings: endings.map((e) => ({
                stepId: e.id,
                outcome: named[e.id]!.outcome.trim(),
                label: named[e.id]!.label.trim() || named[e.id]!.outcome.trim(),
                example: {},
              })),
            })}>
            I attest this is the procedure
          </Action>
          {/* "Not yet" closed the form and left the draft exactly as it was,
              which is what leaving the page does. A control that does nothing
              is one more thing to read. */}
        </div>
      </div>
    </Section>
  );
}

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
  const [opened, setOpened] = useState<Record<string, boolean>>({});
  const [showWhy, setShowWhy] = useState(false);
  const [busy, setBusy] = useState(false);

  if (draft.state === 'empty') {
    return <Page title="Agent"><div style={{ marginTop: 18, border: '1px solid var(--rule)',
      borderRadius: 6, background: 'var(--panel)' }}><EmptyState of={draft.of} /></div></Page>;
  }

  const { workflow, steps, notes, versions, authoring } = draft.value;
  const outstanding = notes.filter((n) => !n.resolved_at);
  const sides = sidesOf(steps);
  const published = versions.length > 0;
  const liveOrLatest = workflow.live_version_id ?? versions[0]?.id ?? null;
  const live = Boolean(workflow.live_version_id);

  const act = async (path: string, body: unknown = {}) => {
    setBusy(true); setRefused(null);
    const result = await send2<{ blockers?: string[]; unproved?: string[] }>(path, body);
    setBusy(false);
    // Blockers first, whichever way the answer arrived. A refusal comes back
    // as 409, which is not the same thing as something going wrong, and
    // reporting it as a status code tells an author nothing they can act on.
    const value = result.ok ? result.value : result.value;
    if (value?.blockers?.length) { setRefused(value.blockers); return; }
    if (value?.unproved?.length) {
      setRefused(value.unproved.map((u) => `"${u}" has not been proved by a run yet.`));
      return;
    }
    if (!result.ok) { setRefused([result.why]); return; }
    setRefresh((n) => n + 1);
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
    const result = await send2(`/api/workflows/${id}/${verb}`, body);
    setBusy(false);
    if (result.ok) setRefresh((n) => n + 1);
    else setEditRefusal(result.why);
  };

  return (
    <Page
      kicker={workflow.paused_at ? 'Paused'
        : published ? 'Published' : workflow.confirmed_at ? 'Confirmed' : 'Draft'}
      title={workflow.name}
      actions={<>
        {workflow.confirmed_at && !published && (
          <Action disabled={busy} onClick={() => void act(`/api/workflows/${id}/publish`)}>Publish a version</Action>
        )}
        {live && <Action onClick={() => go({ at: 'start', version: workflow.live_version_id! })}>Start a run</Action>}
        {/* Retiring is the strongest thing this screen can do and the least
            often wanted, so it is last and quiet. It asks why, because the
            audit trail records the reason and not only the act. */}
        <Action kind="ghost" disabled={busy} onClick={() => {
          const why = window.prompt('Retire this agent? Say why — it goes on the audit trail.');
          if (why?.trim()) void act(`/api/workflows/${id}/archive`, { why: why.trim() });
        }}>Retire it</Action>
      </>}
    >
      <Stages confirmed={Boolean(workflow.confirmed_at)} published={published}
        outstanding={outstanding.length} />

      {refused && <Refusal title="Nothing was changed" blockers={refused} />}

      {/* Confirming was two acts: a button in the header that revealed the
          form, and the attestation at the foot of it. The first decided
          nothing — it could not be declined, it had no consequence, and
          pressing it was the only way to see what was being asked. So the form
          is simply here, until it has been used. */}
      {!workflow.confirmed_at && <Confirm draft={draft.value} onDone={act} />}

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
            <div key={s.id} style={{ borderBottom: i === steps.length - 1 ? 'none' : '1px solid var(--rule)' }}>
            <div
              onClick={() => setOpened((o) => ({ ...o, [s.id]: !o[s.id] }))}
              style={{ padding: '11px 0', display: 'flex', alignItems: 'center', gap: 13, cursor: 'pointer' }}>
              <span style={{ width: 18, fontSize: 12, color: 'var(--ink-2)', textAlign: 'right' }}>{s.position}</span>
              <span style={{ width: 70, fontFamily: 'var(--mono)', fontSize: 12, fontWeight: 600,
                color: 'var(--running-ink)' }}>{s.kind}</span>
              {sides.get(s.id) && (
                <span style={{ fontSize: 11.5, fontFamily: 'var(--mono)', color: 'var(--ink-2)',
                  border: '1px solid var(--rule-2)', borderRadius: 3, padding: '1px 6px', flexShrink: 0 }}>
                  if {sides.get(s.id)}
                </span>
              )}
              <span style={{ flexGrow: 1, fontSize: 13.5 }}>{summary(s.declares)}</span>
              {strategy(s.declares) && <span style={{ fontSize: 11.5, color: 'var(--ink-2)',
                fontFamily: 'var(--mono)' }}>by {strategy(s.declares)}</span>}
              {!s.complete && <Chip state="attention">not finished</Chip>}
              <span aria-hidden style={{ width: 12, flexShrink: 0, fontSize: 11, color: 'var(--ink-2)',
                transform: opened[s.id] ? 'rotate(90deg)' : 'none', transition: 'transform .12s' }}>›</span>
              {editable && (
                <span style={{ display: 'flex', gap: 1, flexShrink: 0 }}
                  // The row opens on click; these do their own thing and must
                  // not also open it.
                  onClick={(e) => e.stopPropagation()}>
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
            {opened[s.id] && <Detail step={s} />}
            </div>
          ))}
        </div>

        {editable && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, paddingTop: 13, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 13, color: 'var(--ink-2)' }}>Add a</span>
            <select value={adding.kind} disabled={busy} aria-label="Kind of step to add"
              onChange={(e) => setAdding((a) => ({ ...a, kind: e.target.value }))}
              style={{ font: 'inherit', fontSize: 13, fontFamily: 'var(--mono)', padding: '5px 7px',
                border: '1px solid var(--rule-2)', borderRadius: 3, background: 'var(--panel)' }}>
              {KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
            </select>
            <span style={{ fontSize: 13, color: 'var(--ink-2)' }}>step after</span>
            <select value={adding.after} disabled={busy} aria-label="Where to add the step"
              onChange={(e) => setAdding((a) => ({ ...a, after: Number(e.target.value) }))}
              style={{ font: 'inherit', fontSize: 13, padding: '5px 7px',
                border: '1px solid var(--rule-2)', borderRadius: 3, background: 'var(--panel)' }}>
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
function Stages({ confirmed, published, outstanding }: {
  confirmed: boolean; published: boolean; outstanding: number;
}) {
  // Four stages, each one a fact the store holds: the workflow exists, it was
  // attested to, a version was minted, a version is live.
  //
  // "Checked" was a fifth, and it was not a state. Checking is something a
  // person does, and the questions it raises are answered while confirming —
  // so it could never be false while Confirmed was true. It survives as an
  // instruction on the bring-in page, which is where a thing you do belongs,
  // and the count it carried is now the reason confirmation is blocked, which
  // is what §4 asks for: the status, and what is stopping the next act.
  // Three stages, and publishing is the last of them: a published version is
  // runnable. There was a fourth — a version had to have every conclusion it
  // declares reached by a real run before it could be activated — and it is
  // off by decision. As a stage it read as another phase of the workflow
  // rather than as the check it was, and confused more than it protected.
  //
  // Testing did not go away, only the gate: the panel that proves each
  // conclusion is still reachable from here, it just no longer stands between
  // a version and its first run.
  const stages = [
    { name: 'Recorded', done: true, why: '' },
    { name: 'Confirmed', done: confirmed,
      why: outstanding > 0
        ? `${outstanding} ${outstanding === 1 ? 'question' : 'questions'} to answer first`
        : 'nobody has attested to it yet' },
    { name: 'Published', done: published, why: 'confirm it first' },
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
