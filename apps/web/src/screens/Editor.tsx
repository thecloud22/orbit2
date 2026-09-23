/**
 * The procedure editor: one page for an agent's whole life (plan
 * docs/plans/2026-09-22-procedure-editor.md, rules R1–R25).
 *
 * The author's words sit on the left, laid out as written, with Orbit's
 * sentence numbers in the margin; what Orbit made of them opens in the panel
 * beside it. Steps never sit between the sentences (R4), and nothing that
 * needs a person is folded away (R6).
 */
import { useEffect, useMemo, useState } from 'react';
import { Action, Page, Refusal, Section } from '../Page.tsx';
import { Chip, EmptyState, Row, type Emptiness } from '../ui.tsx';
import { send } from '../fetching.ts';
import type { Route } from '../router.ts';
import { Configure } from './Configure.tsx';
import { Picture } from '../editor/Picture.tsx';
import { CONFIGURABLE, Confirm } from './Agent.tsx';
import {
  actsOn, blocksOf, ruleIdsOf, valuesOf, LABEL_INK, LABEL_NAME,
  type Block, type Draft, type Shot, type Step,
} from '../editor/model.ts';
import {
  ChatPanel, DataStorePanel, InputsPanel, OutputsPanel, PanelNote, RulesPanel, StepsPanel, TABS, ValueChip, mono, quiet,
  type Tab,
} from '../editor/panels.tsx';

/**
 * The draft, kept on screen while it is read again. `useFetch` starts every
 * read from "not loaded yet", which is right for a new page and wrong for a
 * page Orbit is working on: it blanked the procedure every few seconds.
 */
function useDraft(id: string, refresh: number): { state: 'loaded'; value: Draft } | { state: 'empty'; of: Emptiness } {
  const [result, setResult] = useState<{ state: 'loaded'; value: Draft } | { state: 'empty'; of: Emptiness }>(
    { state: 'empty', of: { kind: 'notLoadedYet' } });
  useEffect(() => {
    let live = true;
    fetch(`/api/workflows/${id}`)
      .then(async (r) => {
        const body: unknown = await r.json();
        if (!live) return;
        if (r.status === 404) setResult({ state: 'empty', of: { kind: 'nothingMatching', searched: id } });
        else if (!r.ok) setResult((was) => was.state === 'loaded' ? was : { state: 'empty', of: { kind: 'couldNotLoad',
          why: (body as { why?: string }).why ?? 'The record store did not answer. Nothing is lost: this screen could not read it.' } });
        else setResult({ state: 'loaded', value: body as Draft });
      })
      .catch(() => live && setResult((was) => was.state === 'loaded' ? was : { state: 'empty', of: { kind: 'couldNotLoad',
        why: 'The record store did not answer. Nothing is lost: this screen could not read it.' } }));
    return () => { live = false; };
  }, [id, refresh]);
  return result;
}

export function Editor({ id, go }: { id: string; go: (to: Route) => void }) {
  const [refresh, setRefresh] = useState(0);
  const loaded = useDraft(id, refresh);
  const [tab, setTab] = useState<Tab>('steps');
  const [blockId, setBlockId] = useState<string | null>(null);
  const [stepId, setStepId] = useState<string | null>(null);
  const [allSteps, setAllSteps] = useState(false);
  const [valueName, setValueName] = useState<string | null>(null);
  const [refused, setRefused] = useState<string[] | null>(null);
  const [editRefusal, setEditRefusal] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [configuring, setConfiguring] = useState<string | null>(null);
  const [adding, setAdding] = useState<string>('end');
  const [showWhy, setShowWhy] = useState(false);

  const draft = loaded.state === 'loaded' ? loaded.value : null;
  const u = draft?.understanding ?? null;
  // Orbit is at work: sorting, drafting, answering the chat or mapping. The
  // page reads itself again until it is not, so nobody refreshes to find out.
  const working = Boolean(draft && (
    (u && (u.status === 'queued' || u.status === 'sorting'))
    || (u?.confirmed_at && u.walk && !['brought in', 'refused'].includes(u.walk))
    || draft.chat.some((m) => m.state === 'queued' || m.state === 'answering')
    || (draft.mapping && ['queued', 'walking', 'running'].includes(draft.mapping.status))));
  useEffect(() => {
    if (!working) return;
    const timer = setInterval(() => setRefresh((n) => n + 1), 2500);
    return () => clearInterval(timer);
  }, [working]);

  const blocks = useMemo(() => blocksOf(draft?.document ?? null, draft?.steps ?? []), [draft]);
  const rules = useMemo(() => ruleIdsOf(draft?.rules ?? null), [draft]);
  const turnOf = useMemo(() => new Map((draft?.authoring.turns ?? []).map((t) => [t.turn, t])), [draft]);

  if (!draft) {
    return <Page title="Agent"><div style={{ marginTop: 18, border: '1px solid var(--rule)', borderRadius: 6,
      background: 'var(--panel)' }}><EmptyState of={loaded.state === 'empty' ? loaded.of : { kind: 'notLoadedYet' }} /></div></Page>;
  }

  const { workflow, steps, notes, versions, authoring } = draft;
  const published = versions.length > 0;
  const live = Boolean(workflow.live_version_id);
  const confirmed = Boolean(workflow.confirmed_at);
  const editable = !live && !confirmed;
  const outstanding = notes.filter((n) => !n.resolved_at);
  const assumed = notes.filter((n) => n.resolved_at && n.kind === 'assumption');
  const sorted = !u || u.status === 'sorted';
  const drafting = Boolean(u?.confirmed_at && u.walk && !['brought in', 'refused'].includes(u.walk));
  const mapping = Boolean(draft.mapping && ['queued', 'running'].includes(draft.mapping.status));
  // The words can change until the agent is published and nobody has taken it
  // back to editing (Decision 17, R21); never while Orbit is sorting or mapping.
  const closed = confirmed && published;
  const wordsOpen = Boolean(u) && sorted && !drafting && !mapping && !closed;

  const positionOf = (sid: unknown) => steps.find((s) => s.id === sid)?.position ?? null;
  const shotOf = (s: Step): Shot | null => (s.made_at_turn ? turnOf.get(s.made_at_turn)?.screenshot ?? null : null);
  const block: Block | null = blocks.find((b) => b.id === blockId)
    ?? blocks.find((b) => b.steps.length > 0) ?? null;

  const choose = (b: Block) => {
    setBlockId(b.id); setStepId(null); setAllSteps(false); setTab('steps');
  };
  const pickValue = (name: string) => { setValueName(name); setTab('datastore'); };

  const act = async (path: string, body: unknown = {}) => {
    setBusy(true); setRefused(null);
    const result = await send<{ blockers?: string[]; unproved?: string[] }>(path, body);
    setBusy(false);
    const value = result.value;
    if (value?.blockers?.length) { setRefused(value.blockers); return false; }
    if (!result.ok) { setRefused([result.why]); return false; }
    setRefresh((n) => n + 1);
    return true;
  };
  const edit = async (verb: string, body: unknown) => {
    setBusy(true); setEditRefusal(null);
    const result = await send(`/api/workflows/${id}/${verb}`, body);
    setBusy(false);
    if (result.ok) setRefresh((n) => n + 1);
    else setEditRefusal(result.why);
    return result.ok;
  };

  // The readiness strip (plan §3): four facts, each derived from the record.
  const document = draft.document ?? [];
  const placed = document.filter((s) => s.label).length;
  const work = document.filter(actsOn);
  const covered = new Set(steps.map((s) => s.from_sentence).filter(Boolean));
  const unstepped = work.filter((s) => s.label !== 'rule' && !covered.has(s.number));
  const pending = draft.pending ?? [];
  // What stands between the sort and a draft, in the order a person meets it.
  const forOrbit = document.filter((s) => !s.withdrawn && (s.label === 'task' || s.label === 'rule')).length;
  const draftBlocked = !u ? '' : u.status === 'refused' ? 'Orbit could not sort this'
    : !sorted ? 'Orbit is sorting' : !document.length ? 'Write the procedure first'
    : placed < document.length ? `${document.length - placed} sentence${document.length - placed === 1 ? ' has' : 's have'} no label yet`
    : u.more_to_come ? 'You said more is to come: add it, or say that is all'
    : draft.unread ? draft.unread : forOrbit === 0 ? 'Nothing is marked for Orbit to do' : '';
  const mapBlocked = !u?.confirmed_at ? 'Nothing is drafted yet'
    : !sorted ? 'Orbit is sorting what changed' : mapping ? 'Orbit is mapping' : !pending.length ? 'Nothing has changed since Orbit last mapped' : '';
  const ready: Array<[string, string, boolean]> = [
    ['Placed', document.length ? `${placed} of ${document.length} sentences` : 'written as one procedure', placed === document.length],
    ['Mapped', drafting ? 'Orbit is drafting\u2026' : mapping ? 'Orbit is mapping\u2026' : !sorted && u?.confirmed_at ? 'Orbit is sorting what changed\u2026' : !steps.length ? 'nothing yet'
      : pending.length ? `${pending.length} change${pending.length === 1 ? '' : 's'} not mapped`
      : unstepped.length ? `${unstepped.length} sentence${unstepped.length === 1 ? ' has' : 's have'} no step` : `${steps.length} steps`,
      !drafting && !mapping && sorted && steps.length > 0 && !pending.length && !unstepped.length],
    ['Questions', outstanding.length ? `${outstanding.length} to answer` : 'none', outstanding.length === 0],
    ['Orbit assumed', assumed.length ? `${assumed.length}, not blocking` : 'nothing', true],
  ];

  const selectedValues = new Set(tab === 'datastore' && valueName ? [valueName] : []);
  const produced = steps.flatMap((s) => {
    const p = s.declares['produces'] as { name?: string; type?: string } | undefined;
    return s.kind === 'read' && p?.name ? [{ name: p.name, type: p.type ?? 'text' }] : [];
  });

  return (
    <Page
      kicker={[live ? 'Published, and live' : published ? 'Published' : confirmed ? 'Confirmed' : 'Draft',
        u?.application ? `against ${u.application}` : null].filter(Boolean).join(' · ')}
      title={workflow.name}
      actions={<>
        {u && !u.confirmed_at && (
          <Action disabled={Boolean(draftBlocked) || busy} why={draftBlocked}
            onClick={() => void act(`/api/workflows/${id}/understood`)}>Confirm and draft it</Action>
        )}
        {u?.confirmed_at && !closed && (pending.length > 0 || mapping || !sorted) && (
          <Action disabled={Boolean(mapBlocked) || busy} why={mapBlocked}
            onClick={() => void act(`/api/workflows/${id}/map-changes`)}>
            {mapping ? 'Mapping\u2026' : `Map changes (${pending.length})`}</Action>
        )}
        {!confirmed && steps.length > 0 && !drafting && (
          <Action kind={confirming ? 'ghost' : pending.length || mapping ? 'ghost' : 'primary'}
            disabled={!confirming && (pending.length > 0 || mapping || !sorted)}
            why="Map the changes first: the steps must be the ones your words now ask for"
            onClick={() => setConfirming((c) => !c)}>
            {confirming ? 'Not yet' : 'Confirm\u2026'}</Action>
        )}
        {confirmed && !published && (
          <Action disabled={busy} onClick={() => void act(`/api/workflows/${id}/publish`)}>Publish a version</Action>
        )}
        {live && <Action onClick={() => go({ at: 'start', version: workflow.live_version_id! })}>Start a run</Action>}
        {closed && (
          <Action kind="ghost" disabled={busy} onClick={() => void act(`/api/workflows/${id}/back-to-draft`)}>Edit for a new version</Action>
        )}
        {confirmed && !published && (
          <Action kind="ghost" disabled={busy} onClick={() => void act(`/api/workflows/${id}/back-to-draft`)}>Back to editing</Action>
        )}
        {!published && (
          <Action kind="ghost" disabled={busy} onClick={() => {
            if (!window.confirm('Discard this draft? Nothing has been published, so it goes for good.')) return;
            void (async () => {
              setBusy(true);
              const result = await send(`/api/workflows/${id}/discard`, {});
              setBusy(false);
              if (result.ok) go({ at: 'agents' }); else setRefused([result.why]);
            })();
          }}>Discard it</Action>
        )}
      </>}>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 4, paddingTop: 16 }}>
        {ready.map(([name, value, done]) => (
          <div key={name} style={{ borderTop: `3px solid ${done ? 'var(--ok)' : 'var(--attention)'}`, paddingTop: 7 }}>
            <div style={{ fontSize: 12, color: 'var(--ink-2)' }}>{name}</div>
            <div style={{ fontSize: 13, fontWeight: 600, marginTop: 2, color: done ? 'var(--ink)' : 'var(--attention-ink)' }}>{value}</div>
          </div>
        ))}
      </div>

      {refused && <Refusal title="Nothing was changed" blockers={refused} />}
      {u?.walk === 'refused' && u.confirmed_at && (
        <Refusal tone="failed" title="The draft could not be made"
          blockers={['The walk over these sentences did not produce a draft. See each turn under "Why the workflow says this".']} />
      )}

      {u?.status === 'refused' && (
        <Refusal tone="failed" title="This was not sorted" blockers={[u.refused ?? 'No reason was recorded.']} />
      )}
      {u && !u.confirmed_at && sorted && draft.unread && (
        <Refusal title="A rule compares something nothing reads" blockers={[draft.unread]} />
      )}
      {(drafting || mapping) && (
        <WalkProgress session={(mapping ? draft.mapping?.session_id : u?.session_id) ?? null}
          what={mapping ? `Orbit is mapping what changed: ${pending.join(', ') || 'the changes'}` : 'Orbit is drafting: working through the sentences marked as its own against the application'} />
      )}
      {u && !u.confirmed_at && (u.more_to_come || u.status === 'sorted') && sorted && (
        <NextPart id={id} moreToCome={u.more_to_come} busy={busy} onDone={() => setRefresh((n) => n + 1)} />
      )}
      {draft.mapping?.status === 'refused' && pending.length > 0 && (
        <Refusal tone="failed" title="Orbit could not map what changed" blockers={[draft.mapping.describe ?? 'No reason was recorded.']} />
      )}
      {closed && (
        <div style={{ marginTop: 14, fontSize: 13, color: 'var(--ink-2)' }}>
          Version {versions[0]?.version} is published and fixed. To change this agent, take it back to editing: the words, the chat and
          the steps open again, and publishing makes version {(versions[0]?.version ?? 0) + 1}. Runs of version {versions[0]?.version} are untouched.
        </div>
      )}

      {confirming && !confirmed && (
        <Confirm draft={draft as never} onDone={async (path, body) => { if (await act(path, body)) setConfirming(false); }} />
      )}

      {outstanding.length > 0 && !confirming && (
        <div style={{ marginTop: 16, background: 'var(--attention-wash)', borderLeft: '3px solid var(--attention)', borderRadius: 5, padding: '12px 16px' }}>
          <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--attention-ink)', marginBottom: 5 }}>
            {outstanding.length === 1 ? 'Orbit has one question' : `Orbit has ${outstanding.length} questions`}</div>
          {outstanding.filter((n) => !n.sentence).map((n) => (
            <div key={n.id} style={{ fontSize: 13, color: 'var(--ink-2)', lineHeight: 1.55 }}>{n.body}</div>
          ))}
          {outstanding.some((n) => n.sentence) && (
            <div style={{ fontSize: 13, color: 'var(--ink-2)' }}>Questions about a sentence are shown under it.</div>
          )}
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 0, marginTop: 18 }}>
        <article style={{ flexGrow: 1, minWidth: 0, paddingRight: 26 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'baseline', fontSize: 12.5, color: 'var(--ink-2)',
            paddingBottom: 10, borderBottom: '1px solid var(--rule)' }}>
            <span style={{ fontWeight: 600, color: 'var(--ink)' }}>Your procedure</span>
            <span>{document.length ? 'as you wrote it; Orbit’s sentence numbers in the margin' : 'as written'}</span>
          </div>
          {document.length === 0 && workflow.procedure && (
            <p style={{ fontSize: 15.5, lineHeight: 1.7, maxWidth: 680, whiteSpace: 'pre-wrap' }}>{workflow.procedure}</p>
          )}
          {document.length === 0 && u && !workflow.procedure && (
            <FirstWords busy={busy} onWrite={(text) => edit('add-sentence', { after: null, text })} />
          )}
          {document.length > 0 && wordsOpen && (
            <AddAtEnd after={document.at(-1)!.number} busy={busy} onWrite={(after, text) => edit('add-sentence', { after, text })} />
          )}
          {blocks.map((b) => (
            <DocumentBlock key={b.id} block={b} on={tab === 'steps' && !allSteps && block?.id === b.id} ruleOf={rules.ofSentence}
              selectedValues={selectedValues} onChoose={() => choose(b)} onValue={pickValue}
              notes={outstanding.filter((n) => n.sentence && b.sentences.some((s) => s.number === n.sentence))}
              pending={pending} busy={busy} onAnswer={(body) => void edit('answer-question', body)}
              wordsOpen={wordsOpen} onEdit={edit} />
          ))}
        </article>

        <aside style={{ width: 430, flexShrink: 0, position: 'sticky', top: 12, maxHeight: 'calc(100vh - 24px)', overflowY: 'auto',
          boxSizing: 'border-box', border: '1px solid var(--rule-2)', borderRadius: 6, background: 'var(--panel)', padding: '14px 18px 18px' }}>
          <div role="tablist" aria-label="Beside the procedure" style={{ display: 'flex', gap: 14, borderBottom: '1px solid var(--rule)', marginBottom: 14, flexWrap: 'wrap' }}>
            {TABS.map(([key, name]) => (
              <button key={key} type="button" role="tab" aria-selected={tab === key} onClick={() => setTab(key)}
                style={{ font: 'inherit', fontSize: 13.5, background: 'transparent', border: 0, cursor: 'pointer', padding: '0 0 9px',
                  color: tab === key ? 'var(--ink)' : 'var(--ink-2)', fontWeight: tab === key ? 700 : 500,
                  boxShadow: tab === key ? 'inset 0 -2px 0 var(--primary)' : 'none' }}>{name}</button>
            ))}
          </div>
          {tab === 'steps' && (
            <StepsPanel draft={draft} block={block} all={allSteps} chosen={stepId} onChoose={setStepId}
              shotOf={shotOf} positionOf={positionOf} editable={editable} busy={busy}
              onEdit={(verb, body) => void edit(verb, body)} onShowAll={setAllSteps}
              extra={(step) => editable && (configuring === step.id || step.missing.length > 0) ? (
                <Configure step={step as never} produced={produced} busy={busy}
                  reachable={steps.filter((o) => o.id !== step.id).map((o) => ({ id: o.id, position: o.position, kind: o.kind, summary: String(o.declares['summary'] ?? o.kind) }))}
                  onSave={(body) => { setConfiguring(null); void edit('configure-step', body); }}
                  onCancel={() => setConfiguring(null)} />
              ) : editable && CONFIGURABLE.includes(step.kind as never) ? (
                <button type="button" style={quiet} onClick={() => setConfiguring(step.id)}>Configure</button>
              ) : null} />
          )}
          {tab === 'steps' && editable && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, flexWrap: 'wrap', marginTop: 14, fontSize: 12.5, color: 'var(--ink-2)' }}>
              Add a
              <select aria-label="Kind of step to add" value={adding} onChange={(e) => setAdding(e.target.value)}
                style={{ font: 'inherit', fontSize: 12.5, ...mono, padding: '3px 5px', border: '1px solid var(--rule-2)', borderRadius: 3, background: 'var(--panel)' }}>
                {CONFIGURABLE.map((k) => <option key={k} value={k}>{k}</option>)}
              </select>
              step after the one chosen
              <button type="button" style={quiet} disabled={busy} onClick={() => {
                const after = steps.find((s) => s.id === stepId)?.position ?? block?.steps.at(-1)?.position ?? steps.length;
                void edit('insert-step', { kind: adding, after });
              }}>Add</button>
            </div>
          )}
          {tab === 'chat' && (
            <ChatPanel messages={draft.chat} busy={busy}
              open={wordsOpen}
              closedWhy={!u ? 'The chat is for a procedure brought in to be understood.'
                : closed ? 'This agent is published. Take it back to editing to change it for the next version; the conversation stays on the record.'
                : mapping || drafting ? 'Orbit is mapping. The chat opens again as soon as it has finished.'
                : 'Orbit is sorting. The chat opens as soon as it has finished.'}
              onSend={async (text) => edit('chat', { text })}
              onTake={(messageId) => void edit('take-offer', { messageId })} />
          )}
          {tab === 'inputs' && <InputsPanel draft={draft} editable={editable} busy={busy} onEdit={edit} />}
          {tab === 'outputs' && <OutputsPanel draft={draft} editable={editable} busy={busy} onEdit={edit} />}
          {tab === 'rules' && <RulesPanel tables={draft.rules} steps={steps} />}
          {tab === 'datastore' && <DataStorePanel draft={draft} chosen={valueName} onChoose={setValueName}
            editable={editable} busy={busy} onEdit={edit} />}
          {editRefusal && (
            <div style={{ marginTop: 12, background: 'var(--failed-wash)', borderLeft: '3px solid var(--failed)', borderRadius: 4, padding: '9px 12px' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--failed-ink)', marginBottom: 3 }}>That change was not made</div>
              <div style={{ fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.5 }}>{editRefusal}</div>
            </div>
          )}
        </aside>
      </div>

      {assumed.length > 0 && (
        <Section title={`What Orbit assumed (${assumed.length})`} note="taken on its own, blocking nothing; say so when you confirm if any of it is wrong">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 820 }}>
            {assumed.map((n) => (
              <div key={n.id} style={{ fontSize: 13.5, lineHeight: 1.6 }}>{n.body}{n.answer && <span style={{ color: 'var(--ink-2)' }}> {n.answer}</span>}</div>
            ))}
          </div>
        </Section>
      )}

      <Section title="Why the workflow says this" note={`${authoring.turns.length} turns, ${authoring.producedNothing} produced nothing usable`}
        right={<button type="button" style={quiet} onClick={() => setShowWhy((v) => !v)}>{showWhy ? 'Hide' : 'Show every turn'}</button>}>
        {showWhy && (
          <div style={{ borderTop: '1px solid var(--ink)' }}>
            {authoring.turns.map((t) => (
              <div key={t.turn} style={{ borderBottom: '1px solid var(--rule)', padding: '11px 0', display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                <span style={{ width: 22, fontSize: 12, color: 'var(--ink-2)', textAlign: 'right', paddingTop: 2 }}>{t.turn}</span>
                <span style={{ width: 92, flexShrink: 0 }}><Chip state={t.verdict === 'kept' ? 'ok' : 'failed'}>{t.verdict}</Chip></span>
                <div style={{ flexGrow: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13.5, marginBottom: 3 }}>{t.why}</div>
                  {t.answered?.element && <div style={{ fontSize: 12.5 }}><span style={{ color: 'var(--ink-2)' }}>It named </span><span style={{ ...mono, fontSize: 12 }}>{t.answered.element}</span></div>}
                  {t.answered && <div style={{ fontSize: 12.5, color: 'var(--ink-2)', fontStyle: 'italic', lineHeight: 1.5 }}>{'“'}{t.answered.why}{'”'}</div>}
                  <div style={{ fontSize: 11, color: 'var(--ink-2)', ...mono, marginTop: 4 }}>{t.model} {'·'} {t.shown.elements} elements shown {'·'} {t.tokens_in}/{t.tokens_out} tokens</div>
                </div>
                {t.screenshot && <div style={{ width: 140, flexShrink: 0 }}>{t.screenshot.digest
                  ? <a href={`/api/screens/${t.screenshot.digest}`} target="_blank" rel="noreferrer"><img src={`/api/screens/${t.screenshot.digest}`} alt={`The page at turn ${t.turn}`} loading="lazy" style={{ width: '100%', border: '1px solid var(--rule-2)', borderRadius: 3 }} /></a>
                  : <span style={{ fontSize: 11.5, color: 'var(--ink-2)' }}>{t.screenshot.withheld}</span>}</div>}
              </div>
            ))}
            <div style={{ paddingTop: 12 }}><Row label="Cost to build">{authoring.costUnknown ? 'not known: no price is held for this model'
              : `$${(authoring.costMicros / 1e6).toFixed(6)}`}</Row></div>
          </div>
        )}
      </Section>

      {published && (
        <Section title="Versions" note="a version is a fact; editing the draft does not change one">
          <div style={{ borderTop: '1px solid var(--ink)' }}>
            {versions.map((v) => (
              <div key={v.version} style={{ borderBottom: '1px solid var(--rule)', padding: '10px 0', display: 'flex', alignItems: 'center', gap: 16 }}>
                <span style={{ width: 90, fontSize: 13.5, fontWeight: 600 }}>Version {v.version}</span>
                <span style={{ flexGrow: 1, ...mono, fontSize: 11.5, color: 'var(--ink-2)' }}>{v.digest.replace('sha256:', '').slice(0, 24)}</span>
                <span style={{ fontSize: 12.5, color: 'var(--ink-2)' }}>{new Date(v.published_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
              </div>
            ))}
          </div>
        </Section>
      )}
    </Page>
  );
}

/** One block of the author's document: the words, the margin, and what Orbit made of them (R2–R6). */
function DocumentBlock({ block, on, ruleOf, selectedValues, onChoose, onValue, notes, pending, busy, onAnswer, wordsOpen, onEdit }: {
  block: Block; on: boolean; ruleOf: (n: string | null | undefined) => string | null;
  busy: boolean; onAnswer: (body: Record<string, unknown>) => void;
  wordsOpen: boolean; onEdit: (verb: string, body: unknown) => Promise<boolean>; selectedValues: Set<string>; onChoose: () => void; onValue: (name: string) => void;
  notes: Draft['notes']; pending: string[];
}) {
  const { sentences, lead, steps } = block;
  if (block.type === 'orbit') {
    return (
      <div onClick={onChoose} style={{ display: 'flex', gap: 14, padding: on ? '12px 10px 12px 0' : '12px 0', marginTop: 10,
        borderTop: '1px dashed var(--rule-2)', cursor: 'pointer', background: on ? 'var(--panel)' : 'transparent',
        boxShadow: on ? 'inset 3px 0 0 var(--primary)' : 'none' }}>
        <span style={{ width: 58, flexShrink: 0 }} />
        <span style={{ flexGrow: 1, fontSize: 13.5, color: 'var(--ink-2)' }}>Added by Orbit: steps no sentence asks for directly, such as opening the application and how a run finishes.</span>
        <button type="button" style={{ font: 'inherit', fontSize: 12.5, fontWeight: 600, color: 'var(--failed-ink)', background: 'transparent', border: 0, cursor: 'pointer', padding: 0, whiteSpace: 'nowrap' }}>
          {steps.length} step{steps.length === 1 ? '' : 's'} {'›'}</button>
      </div>
    );
  }
  const [editing, setEditing] = useState(false);
  const nums = sentences.length === 1 ? sentences[0]!.number : `${sentences[0]!.number}\u2013${sentences.at(-1)!.number}`;
  const heading = block.type === 'heading';
  const acting = lead && actsOn(lead);
  const values = valuesOf(steps);
  const changed = sentences.some((s) => pending.includes(s.number));
  const noStep = Boolean(acting && lead && lead.label !== 'rule' && steps.length === 0);
  const clickable = steps.length > 0 || Boolean(lead);
  return (
    <div onClick={clickable ? onChoose : undefined}
      style={{ padding: on ? '9px 10px 9px 0' : heading ? '16px 0 4px' : '9px 0', cursor: clickable ? 'pointer' : 'default',
        background: on ? 'var(--panel)' : 'transparent', boxShadow: on ? 'inset 3px 0 0 var(--primary)' : 'none' }}>
      <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start' }}>
        <span style={{ width: 58, flexShrink: 0, ...mono, fontSize: 11, color: 'var(--ink-2)', textAlign: 'right', paddingTop: heading ? 2 : 4 }}>{nums}</span>
        <div style={{ flexGrow: 1, minWidth: 0 }}>
          <div style={{ fontSize: heading ? 14.5 : 16, fontWeight: heading ? 700 : 400, lineHeight: 1.6, maxWidth: 680 }}>
            {sentences.map((s, i) => (
              <span key={s.number}>
                {i > 0 && sentences[i - 1]!.part !== s.part && (
                  <span title={`Part ${s.part} begins here${sentences[i - 1]!.unterminated ? ', mid-sentence' : ''}`}
                    style={{ ...mono, fontSize: 10.5, fontWeight: 600, color: 'var(--ink-2)', background: 'var(--panel-2)', borderRadius: 3, padding: '1px 5px', margin: '0 5px' }}>
                    part {s.part} {'›'}</span>
                )}
                <span style={{ color: s.withdrawn ? 'var(--ink-2)' : s.label === 'background' ? 'var(--ink-2)' : 'var(--ink)',
                  textDecoration: s.withdrawn ? 'line-through' : 'none' }}>{s.text}</span>{' '}
              </span>
            ))}
          </div>
          {editing && <WordsEditor sentences={sentences} busy={busy} onEdit={onEdit} onDone={() => setEditing(false)} />}
          {sentences.filter((s) => s.was).map((s) => (
            <div key={s.number} style={{ fontSize: 12, color: 'var(--ink-2)', marginTop: 3, lineHeight: 1.45 }}>
              <span style={{ fontWeight: 600, color: 'var(--ink)' }}>{s.number} changed.</span> Was {'“'}{s.was}{'”'}</div>
          ))}
          {values.length > 0 && (
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginTop: 5, fontSize: 12.5, color: 'var(--ink-2)' }}>
              {values.map((v, i) => (
                <span key={`${v.kind}-${v.name}`} style={{ display: 'inline-flex', gap: 5, alignItems: 'center' }}>
                  {(i === 0 || values[i - 1]!.verb !== v.verb) && <span>{v.verb}</span>}
                  {v.kind === 'secret' ? <span style={{ ...mono, fontSize: 12 }}>{v.name}</span>
                    : <ValueChip name={v.name} on={selectedValues.has(v.name)} onPick={onValue} />}
                </span>
              ))}
            </div>
          )}
          {sentences.some((s) => s.suspicious) && (
            <div style={{ fontSize: 12, color: 'var(--failed-ink)', marginTop: 4 }}>Reads like instructions to a machine. Orbit treats it as text and does not follow it.</div>
          )}
          {notes.map((n) => <InlineQuestion key={n.id} note={n} busy={busy} onAnswer={onAnswer} />)}
        </div>
        <div style={{ width: 150, flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, paddingTop: 3 }}>
          {lead && lead.label && lead.label !== 'background' && (
            <span style={{ fontSize: 12, fontWeight: 700, color: LABEL_INK[lead.label], textAlign: 'right' }}>
              {LABEL_NAME[lead.label]}{lead.waits ? ', the run waits' : ''}
              {lead.label === 'rule' && ruleOf(lead.number) && <span style={{ ...mono, color: 'var(--running-ink)' }}> {'\u00b7'} {ruleOf(lead.number)}</span>}</span>
          )}
          {changed && <Chip state="running">changed, not mapped</Chip>}
          {sentences.some((s) => s.label && s.labelCurrent === false) && <Chip state="running">sorting</Chip>}
          {noStep && !changed && <Chip state="attention">no step yet</Chip>}
          {steps.some((s) => !s.complete) && <Chip state="attention">not finished</Chip>}
          {notes.length > 0 && <Chip state="attention">{notes.length === 1 ? '1 question' : `${notes.length} questions`}</Chip>}
          {wordsOpen && !editing && block.type !== 'heading' && (
            <button type="button" onClick={(e) => { e.stopPropagation(); setEditing(true); }}
              style={{ font: 'inherit', fontSize: 12, color: 'var(--ink-2)', background: 'transparent', border: '1px solid var(--rule-2)', borderRadius: 3, cursor: 'pointer', padding: '1px 8px' }}>Edit</button>
          )}
          {steps.length > 0 && (
            <button type="button" onClick={(e) => { e.stopPropagation(); onChoose(); }}
              style={{ font: 'inherit', fontSize: 12.5, fontWeight: 600, color: 'var(--failed-ink)', background: 'transparent', border: 0, cursor: 'pointer', padding: 0 }}>
              {steps.length} step{steps.length === 1 ? '' : 's'} {'›'}</button>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Your words, changed in place (Decision 17): each sentence of the block as
 * it now reads, what it is for, and a sentence to add after it. Nothing is
 * overwritten: every change is kept as a revision, and what it said before
 * stays on the record.
 */
function WordsEditor({ sentences, busy, onEdit, onDone }: {
  sentences: Block['sentences']; busy: boolean; onEdit: (verb: string, body: unknown) => Promise<boolean>; onDone: () => void;
}) {
  const [texts, setTexts] = useState<Record<string, string>>(Object.fromEntries(sentences.map((s) => [s.number, s.text])));
  const [adding, setAdding] = useState('');
  const field: React.CSSProperties = { font: 'inherit', fontSize: 15, lineHeight: 1.5, padding: '7px 9px', width: '100%', boxSizing: 'border-box',
    border: '1px solid var(--running-ink)', borderRadius: 4, background: 'var(--panel)', resize: 'vertical' };
  const small: React.CSSProperties = { font: 'inherit', fontSize: 12.5, fontWeight: 600, borderRadius: 3, padding: '5px 11px', cursor: 'pointer',
    color: 'var(--ink)', background: 'transparent', border: '1px solid var(--rule-2)' };
  const save = async () => {
    for (const s of sentences) {
      const t = texts[s.number]?.trim() ?? '';
      if (!s.withdrawn && t && t !== s.text && !(await onEdit('revise-sentence', { sentence: s.number, text: t }))) return;
    }
    if (adding.trim() && !(await onEdit('add-sentence', { after: sentences.at(-1)!.number, text: adding.trim() }))) return;
    onDone();
  };
  return (
    <div onClick={(e) => e.stopPropagation()} style={{ display: 'flex', flexDirection: 'column', gap: 9, margin: '8px 0 4px', cursor: 'default' }}>
      {sentences.map((s) => (
        <div key={s.number} style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
          <label style={{ fontSize: 12, color: 'var(--ink-2)', fontFamily: 'var(--mono)' }}>{s.number}
            <textarea rows={2} style={{ ...field, marginTop: 3 }} value={texts[s.number] ?? ''} disabled={s.withdrawn}
              onChange={(e) => setTexts({ ...texts, [s.number]: e.target.value })} /></label>
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12.5, color: 'var(--ink-2)' }}>
            It is
            <select aria-label={`What ${s.number} is`} value={s.label ?? ''} disabled={busy || s.withdrawn}
              onChange={(e) => void onEdit('relabel', { sentence: s.number, label: e.target.value })}
              style={{ font: 'inherit', fontSize: 12.5, padding: '3px 5px', border: '1px solid var(--rule-2)', borderRadius: 3, background: 'var(--panel)' }}>
              {!s.label && <option value="">not placed yet</option>}
              {(['task', 'rule', 'forAPerson', 'background', 'wontDo'] as const).map((l) => <option key={l} value={l}>{LABEL_NAME[l]}</option>)}
            </select>
            <span style={{ flexGrow: 1 }} />
            {!s.withdrawn && <button type="button" style={small} disabled={busy} onClick={() => void onEdit('withdraw-sentence', { sentence: s.number }).then((ok) => ok && onDone())}>Take it out</button>}
          </div>
        </div>
      ))}
      <label style={{ fontSize: 12, color: 'var(--ink-2)' }}>A sentence to add after this
        <textarea rows={2} style={{ ...field, borderColor: 'var(--rule-2)', marginTop: 3 }} value={adding} onChange={(e) => setAdding(e.target.value)}
          placeholder="Also refer the file to a senior underwriter if the DTI is over 45%." /></label>
      <div style={{ display: 'flex', gap: 7, alignItems: 'center' }}>
        <button type="button" disabled={busy} onClick={() => void save()}
          style={{ ...small, color: 'var(--page)', background: 'var(--ink)', border: '1px solid var(--ink)' }}>Keep these changes</button>
        <button type="button" style={small} onClick={onDone}>Cancel</button>
        <span style={{ fontSize: 12, color: 'var(--ink-2)' }}>Kept as revisions: what it said before stays on the record.</span>
      </div>
    </div>
  );
}

/**
 * Orbit at work, shown as it goes: the latest turn and the page it was looking
 * at, so nobody waits on a spinner with nothing to read (product rule 11).
 */
function WalkProgress({ session, what }: { session: string | null; what: string }) {
  const [turns, setTurns] = useState<Array<{ turn: number; verdict: string; why: string; screenshot?: { digest?: string; withheld?: string } | null }>>([]);
  useEffect(() => {
    if (!session) return;
    let live = true;
    const read = () => fetch(`/api/authoring/${session}`).then((r) => r.json())
      .then((b: { turns?: typeof turns }) => { if (live) setTurns(b.turns ?? []); }).catch(() => undefined);
    void read();
    const timer = setInterval(read, 2500);
    return () => { live = false; clearInterval(timer); };
  }, [session]);
  const last = turns.at(-1);
  const pictured = [...turns].reverse().find((t) => t.screenshot?.digest);
  return (
    <div style={{ marginTop: 16, display: 'flex', gap: 16, alignItems: 'flex-start', background: 'var(--running-wash)',
      borderLeft: '3px solid var(--running)', borderRadius: 5, padding: '12px 16px' }}>
      <div style={{ flexGrow: 1, minWidth: 0 }}>
        <div className="orbit-working" style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--running-ink)' }}>{what}
          <span style={{ fontFamily: 'var(--mono)' }}><span className="orbit-dot">.</span><span className="orbit-dot">.</span><span className="orbit-dot">.</span></span></div>
        <div style={{ fontSize: 12.5, color: 'var(--ink-2)', marginTop: 5, lineHeight: 1.5 }}>
          {last ? `Turn ${last.turn}, ${last.verdict}: ${last.why}` : 'Waiting for a worker to pick this up.'}</div>
      </div>
      {pictured?.screenshot && (
        <div style={{ width: 180, flexShrink: 0 }}>
          <Picture shot={pictured.screenshot} size="large" alt={`The page at turn ${pictured.turn}`} />
        </div>
      )}
    </div>
  );
}

/** The next part of a procedure brought in a page or two at a time, or saying that is all of it (2.1 §13). */
function NextPart({ id, moreToCome, busy, onDone }: { id: string; moreToCome: boolean; busy: boolean; onDone: () => void }) {
  const [text, setText] = useState('');
  const [open, setOpen] = useState(moreToCome);
  const [refused, setRefused] = useState<string | null>(null);
  const post = async (path: string, body: unknown) => {
    setRefused(null);
    const r = await send(path, body);
    if (r.ok) { setText(''); onDone(); } else setRefused(r.why);
  };
  if (!open) {
    return <div style={{ marginTop: 12 }}><button type="button" onClick={() => setOpen(true)} style={{ ...quiet, fontSize: 12.5 }}>Add another part of the procedure</button></div>;
  }
  return (
    <div style={{ marginTop: 14, border: '1px solid var(--rule-2)', borderRadius: 5, padding: '12px 14px', background: 'var(--panel)', maxWidth: 820 }}>
      <div style={{ fontSize: 13.5, fontWeight: 700, marginBottom: 6 }}>{moreToCome ? 'You said more is to come' : 'Another part'}</div>
      <textarea rows={4} value={text} onChange={(e) => setText(e.target.value)} aria-label="The next part"
        placeholder="Paste the next page or two, exactly as written."
        style={{ width: '100%', boxSizing: 'border-box', font: 'inherit', fontSize: 14, lineHeight: 1.6, padding: '9px 11px',
          border: '1px solid var(--rule-2)', borderRadius: 4, resize: 'vertical' }} />
      <div style={{ display: 'flex', gap: 8, marginTop: 8, alignItems: 'center' }}>
        <button type="button" disabled={busy || !text.trim()} onClick={() => void post(`/api/workflows/${id}/parts`, { body: text, moreToCome: false })}
          style={{ font: 'inherit', fontSize: 13, fontWeight: 600, borderRadius: 3, padding: '6px 12px', cursor: 'pointer', color: 'var(--page)', background: 'var(--ink)', border: '1px solid var(--ink)' }}>Sort this part</button>
        {moreToCome && <button type="button" disabled={busy} onClick={() => void post(`/api/workflows/${id}/more-to-come`, { moreToCome: false })}
          style={{ ...quiet, fontSize: 13 }}>That is all of it</button>}
        {!moreToCome && <button type="button" onClick={() => setOpen(false)} style={{ ...quiet, fontSize: 13 }}>Cancel</button>}
        {refused && <span style={{ fontSize: 12.5, color: 'var(--failed-ink)' }}>{refused}</span>}
      </div>
    </div>
  );
}

/** A blank page (R22): the first words of the procedure, kept as the author's. */
function FirstWords({ busy, onWrite }: { busy: boolean; onWrite: (text: string) => Promise<boolean> }) {
  const [text, setText] = useState('');
  return (
    <div style={{ padding: '18px 0', maxWidth: 720 }}>
      <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>A blank page</div>
      <div style={{ fontSize: 13, color: 'var(--ink-2)', marginBottom: 10, lineHeight: 1.55 }}>
        Write the procedure the way you would to somebody starting Monday. Orbit sorts each sentence as it arrives, and drafts nothing until you confirm.</div>
      <textarea rows={8} value={text} onChange={(e) => setText(e.target.value)} aria-label="The procedure"
        placeholder={'1. Sign in to the portal.\n2. Open the loan file using the loan number.\n3. Read the note rate.'}
        style={{ width: '100%', boxSizing: 'border-box', font: 'inherit', fontSize: 15, lineHeight: 1.7, padding: '12px 14px',
          border: '1px solid var(--rule-2)', borderRadius: 5, resize: 'vertical', background: 'var(--panel)' }} />
      <button type="button" disabled={busy || text.trim().length < 5} onClick={() => void onWrite(text).then((ok) => ok && setText(''))}
        style={{ marginTop: 9, font: 'inherit', fontSize: 13.5, fontWeight: 600, borderRadius: 3, padding: '8px 15px', cursor: 'pointer',
          color: 'var(--ink)', background: 'var(--primary)', border: '1px solid var(--primary)' }}>Keep these words</button>
    </div>
  );
}

/** More words at the end of the procedure, in the author's own words (Decision 17). */
function AddAtEnd({ after, busy, onWrite }: { after: string; busy: boolean; onWrite: (after: string, text: string) => Promise<boolean> }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  if (!open) {
    return <div style={{ padding: '12px 0 0 72px' }}><button type="button" onClick={() => setOpen(true)} style={{ ...quiet, fontSize: 12.5 }}>Add a sentence at the end</button></div>;
  }
  return (
    <div style={{ padding: '12px 0 0 72px', maxWidth: 700 }}>
      <textarea rows={2} value={text} onChange={(e) => setText(e.target.value)} aria-label="A sentence to add at the end"
        style={{ width: '100%', boxSizing: 'border-box', font: 'inherit', fontSize: 15, lineHeight: 1.5, padding: '7px 9px',
          border: '1px solid var(--running-ink)', borderRadius: 4, resize: 'vertical' }} />
      <div style={{ display: 'flex', gap: 7, marginTop: 6 }}>
        <button type="button" disabled={busy || !text.trim()} onClick={() => void onWrite(after, text).then((ok) => { if (ok) { setText(''); setOpen(false); } })}
          style={{ font: 'inherit', fontSize: 12.5, fontWeight: 600, borderRadius: 3, padding: '5px 11px', cursor: 'pointer', color: 'var(--page)', background: 'var(--ink)', border: '1px solid var(--ink)' }}>Add it</button>
        <button type="button" onClick={() => setOpen(false)} style={{ ...quiet, fontSize: 12.5 }}>Cancel</button>
      </div>
    </div>
  );
}

/** A question about this sentence, on the page under it, with the picture Orbit was looking at (R6, R19). */
function InlineQuestion({ note, busy, onAnswer }: {
  note: Draft['notes'][number]; busy: boolean; onAnswer: (body: Record<string, unknown>) => void;
}) {
  const [words, setWords] = useState('');
  const button: React.CSSProperties = { font: 'inherit', fontSize: 12.5, textAlign: 'left', borderRadius: 3, padding: '5px 9px',
    background: 'var(--panel)', border: '1px solid var(--rule-2)', cursor: 'pointer', color: 'var(--ink)' };
  const answer = (body: Record<string, unknown>) => onAnswer({ noteId: note.id, ...body });
  return (
    <div onClick={(e) => e.stopPropagation()}
      style={{ marginTop: 9, background: 'var(--attention-wash)', borderLeft: '3px solid var(--attention)', borderRadius: 5, padding: '11px 13px',
        display: 'flex', gap: 14, alignItems: 'flex-start', cursor: 'default' }}>
      <div style={{ flexGrow: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 7 }}>
        <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--attention-ink)' }}>Orbit is asking</div>
        <div style={{ fontSize: 13, lineHeight: 1.5 }}>{note.body}</div>
        {note.action === 'pickElement' && (note.candidates ?? []).length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            {(note.candidates ?? []).map((c, i) => (
              <button key={c.name + i} type="button" style={button} disabled={busy} onClick={() => answer({ candidate: c.name })}>
                <span style={{ fontWeight: 700 }}>{i + 1}</span> {'\u00b7'} the {c.what} {c.label ? `labelled \u201c${c.label}\u201d, showing ` : 'named '}{'\u201c'}{c.name}{'\u201d'}
              </button>
            ))}
          </div>
        )}
        {note.action === 'pickElement' && (
          <button type="button" style={{ ...button, borderStyle: 'dashed', background: 'transparent' }} disabled={busy}
            onClick={() => answer({ notOnPage: true })}>It is not on this page</button>
        )}
        {note.action === 'useInput' && (
          <div><button type="button" style={button} disabled={busy} onClick={() => answer({})}>Make it an input, with this value as its example</button></div>
        )}
        {note.action === 'giveExample' && (
          <form onSubmit={(e) => { e.preventDefault(); if (words.trim()) answer({ example: words }); }} style={{ display: 'flex', gap: 6 }}>
            <input aria-label="An example value" value={words} onChange={(e) => setWords(e.target.value)} placeholder="ML-26-04471"
              style={{ font: 'inherit', fontSize: 13, padding: '5px 8px', border: '1px solid var(--rule-2)', borderRadius: 3, flexGrow: 1 }} />
            <button type="submit" style={button} disabled={busy || !words.trim()}>Use this example</button>
          </form>
        )}
        {note.action !== 'useInput' && note.action !== 'giveExample' && (
          <form onSubmit={(e) => { e.preventDefault(); if (words.trim()) answer({ answer: words }); }} style={{ display: 'flex', gap: 6 }}>
            <input aria-label="Your answer" value={words} onChange={(e) => setWords(e.target.value)}
              placeholder={note.action === 'pickElement' ? 'Or say what it is' : 'Your answer'}
              style={{ font: 'inherit', fontSize: 13, padding: '5px 8px', border: '1px solid var(--rule-2)', borderRadius: 3, flexGrow: 1 }} />
            <button type="submit" style={button} disabled={busy || !words.trim()}>Answer</button>
          </form>
        )}
        {note.action === 'pickElement' && <div style={{ fontSize: 11.5, color: 'var(--ink-2)' }}>Orbit maps this sentence again with your answer when you press Map changes.</div>}
      </div>
      {note.picture && (
        <div style={{ width: 210, flexShrink: 0 }}>
          <Picture shot={note.picture} size="large" alt={`The page Orbit was looking at for ${note.sentence ?? 'this question'}`} />
          <div style={{ fontSize: 11, color: 'var(--ink-2)', marginTop: 4 }}>The page Orbit was looking at, turn {note.at_turn}</div>
        </div>
      )}
    </div>
  );
}

export { PanelNote };
