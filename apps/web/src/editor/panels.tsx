/**
 * The panel beside the procedure (procedure editor, plan §3): what Orbit made
 * of the author's words, one tab at a time. Steps never sit between the
 * sentences (R4); they, and everything else, open here.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { Chip } from '../ui.tsx';
import { Picture } from './Picture.tsx';
import {
  elementWords, heldOf, objectsOf, ruleIdsOf, sayStep, targetOf, valueWords, words, LABEL_NAME,
  type Block, type ChatMessage, type Draft, type RuleTable, type Shot, type Step,
} from './model.ts';

export type Tab = 'steps' | 'chat' | 'inputs' | 'outputs' | 'rules' | 'datastore';
export const TABS: Array<[Tab, string]> = [
  ['steps', 'Steps'], ['chat', 'Chat'], ['inputs', 'Inputs'], ['outputs', 'Outputs'], ['rules', 'Rules'], ['datastore', 'DataStore'],
];

export const mono: React.CSSProperties = { fontFamily: 'var(--mono)' };
export const quiet: React.CSSProperties = {
  font: 'inherit', fontSize: 12, color: 'var(--ink-2)', background: 'transparent',
  border: '1px solid var(--rule-2)', borderRadius: 3, cursor: 'pointer', padding: '2px 8px',
};
export const field: React.CSSProperties = {
  font: 'inherit', fontSize: 13, padding: '6px 8px', boxSizing: 'border-box', width: '100%',
  border: '1px solid var(--rule-2)', borderRadius: 3, background: 'var(--panel)', color: 'var(--ink)',
};

export function PanelNote({ children }: { children: ReactNode }) {
  return <div style={{ fontSize: 12.5, color: 'var(--ink-2)', lineHeight: 1.5 }}>{children}</div>;
}
export function PanelHeading({ children, note }: { children: ReactNode; note?: ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, margin: '4px 0 6px' }}>
      <span style={{ fontSize: 13.5, fontWeight: 700 }}>{children}</span>
      {note && <span style={{ fontSize: 12, color: 'var(--ink-2)' }}>{note}</span>}
    </div>
  );
}

/** A value's name as a chip that opens it in the DataStore tab. */
export function ValueChip({ name, on, onPick }: { name: string; on?: boolean; onPick?: (name: string) => void }) {
  return (
    <button type="button" onClick={(e) => { e.stopPropagation(); onPick?.(name); }}
      style={{ ...mono, fontSize: 12, fontWeight: 600, color: 'var(--ink)', cursor: onPick ? 'pointer' : 'default',
        background: on ? 'var(--running-wash)' : 'var(--panel)', border: `1px solid ${on ? 'var(--running-ink)' : 'var(--rule-2)'}`,
        borderRadius: 3, padding: '1px 6px' }}>{name}</button>
  );
}

// ─── Steps ──────────────────────────────────────────────────────────────────

export function StepsPanel({ draft, block, all, chosen, onChoose, shotOf, positionOf, editable, busy, onEdit, onShowAll, extra }: {
  draft: Draft; block: Block | null; all: boolean; chosen: string | null; onChoose: (id: string) => void;
  shotOf: (step: Step) => Shot | null; positionOf: (id: unknown) => number | null;
  editable: boolean; busy: boolean; onEdit: (verb: string, body: unknown) => void; onShowAll: (all: boolean) => void;
  /** What goes under the chosen step: configuring it, when it is unfinished. */
  extra?: (step: Step) => ReactNode;
}) {
  const steps = all ? draft.steps : block?.steps ?? [];
  const rules = ruleIdsOf(draft.rules);
  const step = steps.find((s) => s.id === chosen) ?? steps.find((s) => shotOf(s)?.digest) ?? steps[0] ?? null;
  const lead = block?.lead ?? block?.sentences[0] ?? null;
  const why = !block ? 'Choose a sentence in the procedure to see the steps that carry it out.'
    : block.type === 'orbit' ? ''
    : !lead?.label ? 'Not placed yet.'
    : lead.label === 'background' ? 'Background. Nobody has to do anything.'
    : lead.label === 'wontDo' ? 'Orbit won’t: the procedure says not to, and the run is never offered it.'
    : lead.label === 'forAPerson' && !lead.waits ? 'Left to a person. Orbit does not do this; every run lists it for them.'
    : 'No step carries this out yet.';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
        <span style={{ fontSize: 12.5, color: 'var(--ink-2)', flexGrow: 1 }}>
          {all ? `Every step, ${draft.steps.length}` : block?.type === 'orbit' ? 'Steps Orbit added that no sentence asks for'
            : block ? <><span style={mono}>{block.sentences.length > 1 ? `${block.sentences[0]!.number}–${block.sentences.at(-1)!.number}` : block.id}</span></> : ''}
        </span>
        <button type="button" style={quiet} onClick={() => onShowAll(!all)}>{all ? 'This sentence' : 'Every step'}</button>
      </div>
      {!all && lead && <div style={{ fontSize: 13.5, lineHeight: 1.5 }}>{lead.text}</div>}
      {steps.length === 0 && why && <PanelNote>{why}</PanelNote>}
      {steps.length > 0 && (
        <div style={{ borderTop: '1px solid var(--ink)' }}>
          {steps.map((s) => {
            const on = step?.id === s.id;
            return (
              <button key={s.id} type="button" onClick={() => onChoose(s.id)}
                style={{ width: '100%', display: 'flex', gap: 10, alignItems: 'center', font: 'inherit', textAlign: 'left',
                  background: on ? 'var(--running-wash)' : 'transparent', border: 0, borderBottom: '1px solid var(--rule)',
                  padding: '8px 6px', cursor: 'pointer', color: 'var(--ink)' }}>
                <span style={{ width: 20, flexShrink: 0, fontSize: 12, color: 'var(--ink-2)', textAlign: 'right' }}>{s.position}</span>
                <span style={{ flexGrow: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 13, lineHeight: 1.45 }}>
                    <span style={{ ...mono, fontSize: 11.5, fontWeight: 600, color: 'var(--running-ink)', marginRight: 7 }}>{s.kind}</span>
                    {sayStep(s, positionOf)}
                    {rules.ofStep(s) && <sup title={`Carries out business rule ${rules.ofStep(s)}`}
                      style={{ ...mono, fontSize: 9.5, fontWeight: 700, color: 'var(--running-ink)', marginLeft: 3 }}>{rules.ofStep(s)}</sup>}
                  </span>
                  <span style={{ display: 'block', fontSize: 11.5, color: s.missing.length ? 'var(--attention-ink)' : 'var(--ink-2)', marginTop: 2, lineHeight: 1.4 }}>
                    {elementWords(s)}{all && s.from_sentence ? ` · from ${s.from_sentence}` : ''}
                  </span>
                </span>
                <Picture shot={shotOf(s)} size="small" alt={`The page when Orbit mapped step ${s.position}`} />
              </button>
            );
          })}
        </div>
      )}
      {step && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
            <span style={{ fontSize: 13, fontWeight: 700 }}>Step {step.position}</span>
            <span style={{ fontSize: 12, color: 'var(--ink-2)' }}>{shotOf(step)?.digest ? 'the page when Orbit mapped it' : ''}</span>
            {!step.complete && <Chip state="attention">not finished</Chip>}
          </div>
          <Picture shot={shotOf(step)} size="large" alt={`The page when Orbit mapped step ${step.position}, ${elementWords(step) ?? ''} boxed`} />
          {shotOf(step)?.digest && (
            <div style={{ fontSize: 11.5, color: 'var(--ink-2)', ...mono }}>
              {shotOf(step)!.box ? 'Boxed: ' : ''}{elementWords(step)} {'·'} <a href={`/api/screens/${shotOf(step)!.digest}`} target="_blank" rel="noreferrer" style={{ fontWeight: 600, textDecoration: 'none' }}>open full size</a>
            </div>
          )}
          <StepFacts step={step} />
          {draft.lastRun && (
            <div style={{ fontSize: 12.5 }}>
              <a href={`/runs/${draft.lastRun.reference}`} style={{ fontWeight: 600, textDecoration: 'none' }}>
                See it in test run {draft.lastRun.reference} {'›'}</a>
              <span style={{ color: 'var(--ink-2)' }}> (version {draft.lastRun.version})</span>
            </div>
          )}
          {editable && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', paddingTop: 2 }}>
              <button type="button" style={quiet} disabled={busy || step.position === 1}
                onClick={() => onEdit('move-step', { stepId: step.id, to: step.position - 1 })}>Move earlier</button>
              <button type="button" style={quiet} disabled={busy || step.position === draft.steps.length}
                onClick={() => onEdit('move-step', { stepId: step.id, to: step.position + 1 })}>Move later</button>
              <button type="button" style={quiet} disabled={busy} onClick={() => onEdit('delete-step', { stepId: step.id })}>Remove</button>
            </div>
          )}
          {extra?.(step)}
        </div>
      )}
    </div>
  );
}

/** What a step will do, in the contract's own terms rather than a model's summary. */
function StepFacts({ step }: { step: Step }) {
  const d = step.declares;
  const lines: Array<[string, string]> = [];
  const target = targetOf(d);
  if (step.kind === 'enter') lines.push(['Types', valueWords(d['value'])]);
  if (step.kind === 'read') {
    const p = d['produces'] as { name?: string; type?: string; required?: boolean } | undefined;
    lines.push(['Keeps it as', `${p?.name ?? '?'}, ${p?.type ?? 'text'}${p?.required === false ? ', may not be there' : ''}`]);
  }
  if (target) lines.push(['On the page', target.label]);
  if (d['changesARecord'] !== undefined && step.kind !== 'open') {
    lines.push(['Changes a record', d['changesARecord'] ? 'Yes: this commits something a person would have to undo' : 'No']);
  }
  if (!lines.length) return null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {lines.map(([k, v]) => (
        <div key={k} style={{ display: 'flex', gap: 10, fontSize: 12.5, lineHeight: 1.45 }}>
          <span style={{ width: 112, flexShrink: 0, color: 'var(--ink-2)' }}>{k}</span>
          <span style={{ color: k === 'Changes a record' && d['changesARecord'] ? 'var(--failed-ink)' : 'var(--ink)' }}>{v}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Chat ───────────────────────────────────────────────────────────────────

export function ChatPanel({ messages, open, closedWhy, busy, onSend, onTake }: {
  messages: ChatMessage[]; open: boolean; closedWhy: string; busy: boolean;
  onSend: (text: string) => Promise<boolean>; onTake: (messageId: string) => void;
}) {
  const [text, setText] = useState('');
  // A message the API has filed and no worker has answered yet (chat_message.state).
  const working = messages.some((m) => m.state === 'waiting');
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <PanelNote>{open ? 'Changes this draft and nothing else. What you ask for is kept in your words, and marked when it is not in the procedure.' : closedWhy}</PanelNote>
      {messages.length === 0 && <PanelNote>Nothing said yet.</PanelNote>}
      {messages.map((m) => (
        <div key={m.id} style={{ alignSelf: m.said_by === 'author' ? 'flex-end' : 'flex-start', maxWidth: '88%',
          fontSize: 13, lineHeight: 1.5, borderRadius: 6, padding: '8px 11px',
          background: m.said_by === 'author' ? 'var(--page)' : 'var(--panel-2)',
          border: m.said_by === 'author' ? '1px solid var(--rule-2)' : '1px solid transparent' }}>
          {m.text}
          {m.outcome?.departs && <div style={{ fontSize: 11.5, color: 'var(--attention-ink)', marginTop: 4, fontWeight: 600 }}>Not in the procedure</div>}
          {m.outcome?.refused && <div style={{ fontSize: 12, color: 'var(--failed-ink)', marginTop: 4 }}>{m.outcome.refused}</div>}
          {m.outcome?.offer && open && (
            <div style={{ marginTop: 6 }}><button type="button" style={quiet} disabled={busy} onClick={() => onTake(m.id)}>
              {m.outcome.offer === 'revise' ? 'Make this change' : 'Add it as work for a person'}</button></div>
          )}
        </div>
      ))}
      {working && <PanelNote>Orbit is answering…</PanelNote>}
      {open && (
        <form onSubmit={(e) => { e.preventDefault(); if (!text.trim()) return; void onSend(text).then((ok) => ok && setText('')); }}
          style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{ fontSize: 12.5, color: 'var(--ink-2)' }} htmlFor="chat-box">Ask for a change</label>
          <textarea id="chat-box" rows={3} value={text} onChange={(e) => setText(e.target.value)} disabled={busy || working}
            placeholder="Also refer the file to a senior underwriter if the DTI is over 45%."
            style={{ ...field, resize: 'vertical' }} />
          <div><button type="submit" disabled={busy || working || !text.trim()}
            style={{ font: 'inherit', fontSize: 13, fontWeight: 600, borderRadius: 3, padding: '6px 12px', cursor: 'pointer',
              color: 'var(--page)', background: 'var(--ink)', border: '1px solid var(--ink)' }}>Send</button></div>
        </form>
      )}
    </div>
  );
}

// ─── Inputs, Outputs (R8–R11, R13, R26) ────────────────────────────────────

export type OnEdit = (verb: string, body: unknown) => Promise<boolean>;

/** A camelCase name from a label a person wrote: "Loan number" is `loanNumber`. */
export const nameFrom = (label: string) => label.trim().replace(/[^A-Za-z0-9 ]+/g, ' ').split(/\s+/).filter(Boolean)
  .map((w, i) => (i === 0 ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())).join('').replace(/^[^a-z]+/, '');

const small: React.CSSProperties = { font: 'inherit', fontSize: 12.5, fontWeight: 600, borderRadius: 3, padding: '4px 10px', cursor: 'pointer' };
const dark: React.CSSProperties = { ...small, color: 'var(--page)', background: 'var(--ink)', border: '1px solid var(--ink)' };
const plain: React.CSSProperties = { ...small, color: 'var(--ink)', background: 'transparent', border: '1px solid var(--rule-2)' };

function ObjectHeading({ object }: { object: string | null }) {
  return (
    <div style={{ display: 'flex', gap: 7, alignItems: 'baseline', padding: '8px 0 4px' }}>
      <span style={{ fontSize: 12.5, fontWeight: 700 }}>{object ? words(object) : 'Not part of an object'}</span>
      {object && words(object).toLowerCase() !== object && <span style={{ ...mono, fontSize: 11.5, color: 'var(--ink-2)' }}>{object}</span>}
    </div>
  );
}

/** Declaring an input: a label, the name made from it, a type, an example, and the object it belongs to. */
function NewInput({ objects, busy, onEdit, onDone, seed }: {
  objects: string[]; busy: boolean; onEdit: OnEdit; onDone: () => void;
  seed?: { label: string; example: string; object?: string };
}) {
  const [label, setLabel] = useState(seed?.label ?? '');
  const [named, setNamed] = useState<string | null>(null);
  const [type, setType] = useState('text');
  const [required, setRequired] = useState(true);
  const [example, setExample] = useState(seed?.example ?? '');
  const [object, setObject] = useState(seed?.object ?? objects[0] ?? '');
  const [field, setField] = useState<string | null>(null);
  const name = named ?? nameFrom(label);
  const fieldName = field ?? name;
  return (
    <form onSubmit={(e) => {
      e.preventDefault();
      void onEdit('declare-input', { name, label, type, required, ...(example ? { example } : {}),
        ...(object ? { of: { object: nameFrom(object), field: fieldName } } : {}) }).then((ok) => ok && onDone());
    }} style={{ display: 'flex', flexDirection: 'column', gap: 8, background: 'var(--page)', border: '1px solid var(--rule-2)', borderRadius: 5, padding: 12 }}>
      <label style={{ fontSize: 12.5 }}>Label, as a person reads it<input style={field_} value={label} onChange={(e) => setLabel(e.target.value)} required /></label>
      <label style={{ fontSize: 12.5 }}>Name<input style={{ ...field_, ...mono }} value={name} onChange={(e) => setNamed(e.target.value)} /></label>
      <div style={{ display: 'flex', gap: 8 }}>
        <label style={{ fontSize: 12.5, flex: 1 }}>Type<select style={field_} value={type} onChange={(e) => setType(e.target.value)}>
          <option value="text">text</option><option value="number">number</option><option value="date">date</option><option value="yesNo">yes/no</option></select></label>
        <label style={{ fontSize: 12.5, flex: 1 }}>Example<input style={field_} value={example} onChange={(e) => setExample(e.target.value)} placeholder="ML-26-04471" /></label>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <label style={{ fontSize: 12.5, flex: 1 }}>Part of the object<input style={{ ...field_, ...mono }} list="objects" value={object} onChange={(e) => setObject(e.target.value)} placeholder="loan" /></label>
        <label style={{ fontSize: 12.5, flex: 1 }}>as its field<input style={{ ...field_, ...mono }} value={fieldName} onChange={(e) => setField(e.target.value)} /></label>
      </div>
      <datalist id="objects">{objects.map((o) => <option key={o} value={o} />)}</datalist>
      <label style={{ display: 'flex', gap: 7, alignItems: 'center', fontSize: 12.5 }}><input type="checkbox" checked={required} onChange={(e) => setRequired(e.target.checked)} />Required on every run</label>
      <PanelNote>The example is what a test run uses. Changing it later does not redraft (R13).</PanelNote>
      <div style={{ display: 'flex', gap: 7 }}><button type="submit" style={dark} disabled={busy || !label.trim() || !name}>Add it</button>
        <button type="button" style={plain} onClick={onDone}>Cancel</button></div>
    </form>
  );
}
const field_: React.CSSProperties = { ...field, display: 'block', marginTop: 3 };

export function InputsPanel({ draft, editable, busy, onEdit }: { draft: Draft; editable: boolean; busy: boolean; onEdit: OnEdit }) {
  const [adding, setAdding] = useState<null | { label: string; example: string; stepId?: string }>(null);
  const [changing, setChanging] = useState<string | null>(null);
  const [edits, setEdits] = useState<{ label: string; example: string; required: boolean }>({ label: '', example: '', required: true });
  const examples = draft.understanding?.examples ?? {};
  const inputs = draft.workflow.declared_inputs ?? [];
  const held = heldOf(draft);
  const objects = [...new Set(held.flatMap((h) => (h.of ? [h.of.object] : [])))];
  const fixed = draft.steps.filter((s) => s.kind === 'enter' && (s.declares['value'] as { from?: string } | undefined)?.from === 'literal');
  const secrets = draft.steps.filter((s) => s.kind === 'enter' && ['secret', 'account'].includes(String((s.declares['value'] as { from?: string } | undefined)?.from)));
  const grouped = objectsOf(held.filter((h) => h.section === 'Given'));

  /** "Make it an input": the fixed value becomes the example of a new input the step now types (R10). */
  const makeInput = async (stepId: string, label: string, example: string) => {
    const name = nameFrom(label) || 'value';
    const main = objects[0];
    if (!inputs.some((i) => i.name === name)) {
      const ok = await onEdit('declare-input', { name, label, example, ...(main ? { of: { object: main, field: name } } : {}) });
      if (!ok) return;
    }
    await onEdit('set-step-value', { stepId, value: { from: 'input', value: name } });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <PanelHeading note="asked for when a run starts">Given</PanelHeading>
        <div style={{ borderTop: '1px solid var(--ink)' }}>
          {inputs.length === 0 && <div style={{ padding: '8px 0' }}><PanelNote>This agent is given nothing when it starts.</PanelNote></div>}
          {grouped.map((g) => (
            <div key={g.object ?? '-'}>
              <ObjectHeading object={g.object} />
              {g.fields.map((h) => {
                const i = inputs.find((x) => x.name === h.name)!;
                return (
                  <div key={h.name} style={{ padding: '7px 0 7px 10px', borderBottom: '1px solid var(--rule)' }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
                      <span style={{ ...mono, fontSize: 12.5, fontWeight: 600 }}>{h.of ? h.of.field : h.name}</span>
                      {h.of && h.of.field !== h.name && <span style={{ ...mono, fontSize: 11, color: 'var(--ink-2)' }}>{h.name}</span>}
                      <span style={{ flexGrow: 1 }} />
                      <span style={{ fontSize: 12, color: 'var(--ink-2)' }}>{i.type ?? 'text'}{i.required ? ' · required' : ' · optional'}</span>
                      {editable && changing !== h.name && <button type="button" style={quiet} onClick={() => { setChanging(h.name); setEdits({ label: i.label, example: examples[h.name] ?? '', required: i.required }); }}>Change</button>}
                    </div>
                    <div style={{ fontSize: 12.5, color: 'var(--ink-2)', marginTop: 2 }}>
                      {i.label !== h.name ? `${i.label} · ` : ''}{examples[h.name] ? `example ${examples[h.name]}` : 'no example given'}
                      {h.used.length ? ` · used at ${h.used.map((u) => u.split(':')[0]).join(', ')}` : ' · not used by any step'}
                    </div>
                    {changing === h.name && (
                      <form onSubmit={(e) => { e.preventDefault(); void onEdit('change-input', { name: h.name, label: edits.label, required: edits.required, example: edits.example }).then((ok) => ok && setChanging(null)); }}
                        style={{ display: 'flex', flexDirection: 'column', gap: 7, marginTop: 8 }}>
                        <label style={{ fontSize: 12.5 }}>Label<input style={field_} value={edits.label} onChange={(e) => setEdits({ ...edits, label: e.target.value })} /></label>
                        <label style={{ fontSize: 12.5 }}>Example<input style={field_} value={edits.example} onChange={(e) => setEdits({ ...edits, example: e.target.value })} /></label>
                        <label style={{ display: 'flex', gap: 7, alignItems: 'center', fontSize: 12.5 }}><input type="checkbox" checked={edits.required} onChange={(e) => setEdits({ ...edits, required: e.target.checked })} />Required on every run</label>
                        <div style={{ display: 'flex', gap: 7 }}>
                          <button type="submit" style={dark} disabled={busy}>Save</button>
                          <button type="button" style={plain} onClick={() => setChanging(null)}>Cancel</button>
                          <span style={{ flexGrow: 1 }} />
                          <button type="button" style={plain} disabled={busy} onClick={() => void onEdit('remove-input', { name: h.name }).then((ok) => ok && setChanging(null))}>Remove</button>
                        </div>
                      </form>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
        {editable && !adding && <div style={{ marginTop: 8 }}><button type="button" style={plain} onClick={() => setAdding({ label: '', example: '' })}>Add an input</button></div>}
        {editable && adding && !adding.stepId && <div style={{ marginTop: 8 }}><NewInput objects={objects} busy={busy} onEdit={onEdit} onDone={() => setAdding(null)} seed={adding} /></div>}
      </div>
      {fixed.length > 0 && (
        <div>
          <PanelHeading note="the same on every run">Fixed values</PanelHeading>
          <div style={{ borderTop: '1px solid var(--ink)' }}>
            {fixed.map((s) => {
              const lit = (s.declares['value'] as { literal?: { text?: string } }).literal?.text ?? '';
              const into = targetOf(s.declares)?.label ?? 'the field';
              return (
                <div key={s.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--rule)', fontSize: 13 }}>
                  <div>{valueWords(s.declares['value'])} <span style={{ color: 'var(--ink-2)' }}>into {into}, step {s.position}{s.from_sentence ? ` (${s.from_sentence})` : ''}</span></div>
                  {editable && (
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginTop: 6 }}>
                      <button type="button" style={plain} disabled={busy} title={`A new input, with ${lit} as its example`}
                        onClick={() => void makeInput(s.id, into, lit)}>Make it an input</button>
                      {inputs.length > 0 && (
                        <select aria-label={`Use an input for step ${s.position}`} defaultValue="" disabled={busy}
                          onChange={(e) => e.target.value && void onEdit('set-step-value', { stepId: s.id, value: { from: 'input', value: e.target.value } })}
                          style={{ ...field, width: 'auto', fontSize: 12.5, padding: '3px 6px' }}>
                          <option value="">or use an input…</option>
                          {inputs.map((i) => <option key={i.name} value={i.name}>{i.name}</option>)}
                        </select>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <div style={{ marginTop: 6 }}><PanelNote>An input is picked, or a value is fixed. There is nowhere to type a reference such as {'{loanNumber}'}.</PanelNote></div>
        </div>
      )}
      {secrets.length > 0 && (
        <div>
          <PanelHeading note="named, never held, never in the DataStore">Sign-in</PanelHeading>
          <div style={{ borderTop: '1px solid var(--ink)' }}>
            {secrets.map((s) => (
              <div key={s.id} style={{ padding: '8px 0', borderBottom: '1px solid var(--rule)', fontSize: 13 }}>
                {valueWords(s.declares['value'])} <span style={{ color: 'var(--ink-2)' }}>into {targetOf(s.declares)?.label}, step {s.position}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export function OutputsPanel({ draft, editable, busy, onEdit }: { draft: Draft; editable: boolean; busy: boolean; onEdit: OnEdit }) {
  const ends = draft.steps.filter((s) => s.kind === 'end');
  const held = heldOf(draft);
  const [choosing, setChoosing] = useState<string | null>(null);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <PanelNote>What each ending hands back when a run reaches it, as objects. The DataStore holds everything a run touches; these are what it publishes.</PanelNote>
      {ends.length === 0 && <PanelNote>No ending yet: a run of this draft would not finish.</PanelNote>}
      {ends.map((e) => {
        const publishes = (e.declares['publishes'] as string[] | undefined) ?? [];
        const handed = objectsOf(held.filter((h) => publishes.includes(h.name)));
        return (
          <div key={e.id}>
            <div style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
              <span style={{ fontSize: 14, fontWeight: 700 }}>{String(e.declares['summary'] ?? e.declares['outcome'] ?? 'unnamed')}</span>
              <span style={{ ...mono, fontSize: 11.5, color: 'var(--ink-2)' }}>{String(e.declares['outcome'] ?? '')} {'·'} step {e.position}</span>
              <span style={{ flexGrow: 1 }} />
              {editable && <button type="button" style={quiet} onClick={() => setChoosing(choosing === e.id ? null : e.id)}>{choosing === e.id ? 'Done' : 'Choose'}</button>}
            </div>
            <div style={{ borderTop: '1px solid var(--ink)', marginTop: 6 }}>
              {publishes.length === 0 && choosing !== e.id && <div style={{ padding: '7px 0' }}><PanelNote>Hands back nothing but its name.</PanelNote></div>}
              {choosing !== e.id && handed.map((g) => (
                <div key={g.object ?? '-'} style={{ padding: '6px 0', borderBottom: '1px solid var(--rule)', fontSize: 12.5 }}>
                  <span style={{ fontWeight: 700 }}>{g.object ? words(g.object) : ''}</span>{g.object ? ' ' : ''}
                  <span style={{ ...mono }}>{g.object ? `{ ${g.fields.map((f) => f.of?.field ?? f.name).join(', ')} }` : g.fields.map((f) => f.name).join(', ')}</span>
                </div>
              ))}
              {choosing === e.id && objectsOf(held).map((g) => (
                <div key={g.object ?? '-'}>
                  <ObjectHeading object={g.object} />
                  {g.fields.map((h) => (
                    <label key={h.name} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12.5, padding: '4px 0 4px 10px' }}>
                      <input type="checkbox" checked={publishes.includes(h.name)} disabled={busy}
                        onChange={(ev) => void onEdit('set-publishes', { stepId: e.id,
                          publishes: ev.target.checked ? [...publishes, h.name] : publishes.filter((p) => p !== h.name) })} />
                      <span style={mono}>{h.of?.field ?? h.name}</span>
                      <span style={{ color: 'var(--ink-2)' }}>{h.section === 'Given' ? 'given' : 'found'}</span>
                    </label>
                  ))}
                </div>
              ))}
            </div>
            {choosing === e.id && <div style={{ marginTop: 6 }}><PanelNote>Only a value found on every path to this ending can be handed back; anything else is refused, and says why.</PanelNote></div>}
          </div>
        );
      })}
    </div>
  );
}

// ─── Rules ──────────────────────────────────────────────────────────────────

const IS: Record<string, string> = {
  is: '=', isNot: '≠', isMoreThan: '>', isAtLeast: '≥', isLessThan: '<', isAtMost: '≤', absent: 'is not there', present: 'is there',
};

export function RulesPanel({ tables, steps }: { tables: RuleTable[] | null; steps: Step[] }) {
  if (!tables?.length) return <PanelNote>No rules as tables: nothing in this procedure was sorted as a rule, or the tables are still being made.</PanelNote>;
  const ids = ruleIdsOf(tables);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <PanelNote>Your rule sentences, as tables, each with its identifier. The steps a rule became carry it too. A table is changed by changing its sentence, so it can never say something the procedure does not (R15).</PanelNote>
      {tables.map((t, i) => {
        const table = `BR${t.id ?? i + 1}`;
        const became = steps.filter((s) => { const of = ids.ofStep(s); return of === table || of?.startsWith(`${table}.`); }).map((s) => s.position);
        return (
          <div key={i}>
            <div style={{ fontSize: 13.5, fontWeight: 700 }}><span style={{ ...mono, color: 'var(--running-ink)' }}>{table}</span> {'·'} {t.question}</div>
            <div style={{ fontSize: 12, color: 'var(--ink-2)', margin: '2px 0 7px' }}>
              from {t.sentences.join(', ')} {'·'} {became.length ? `became step${became.length === 1 ? '' : 's'} ${became.join(', ')}` : 'not in the draft yet'}
            </div>
            <div style={{ borderTop: '1px solid var(--ink)' }}>
              {t.rows.map((r, j) => (
                <div key={j} style={{ display: 'flex', gap: 10, fontSize: 12.5, padding: '6px 0', borderBottom: '1px solid var(--rule)' }}>
                  <span style={{ width: 44, flexShrink: 0, ...mono, fontSize: 11, color: 'var(--running-ink)' }}>{table}.{j + 1}</span>
                  <span style={{ width: 140, flexShrink: 0, ...mono, fontSize: 11.5 }}>
                    {r.when.map((w) => `${w.column} ${IS[w.is] ?? w.is}${w.value !== null ? ` ${w.value}` : ''}`).join(' and ') || 'always'}
                  </span>
                  <span style={{ flexGrow: 1 }}>{r.then}</span>
                  <span style={{ ...mono, fontSize: 11, color: 'var(--ink-2)' }}>{r.sentence}</span>
                </div>
              ))}
              {t.otherwise && (
                <div style={{ display: 'flex', gap: 10, fontSize: 12.5, padding: '6px 0', borderBottom: '1px solid var(--rule)', color: 'var(--ink-2)' }}>
                  <span style={{ width: 44, flexShrink: 0 }} /><span style={{ width: 140, flexShrink: 0 }}>otherwise</span><span style={{ flexGrow: 1 }}>{t.otherwise.then}</span>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── DataStore (R12, R26) ───────────────────────────────────────────────────

/** What one run held, read from its record: given and found values by name. */
function useRunValues(reference: string | null): Record<string, string> {
  const [values, setValues] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!reference) return;
    let live = true;
    fetch(`/api/runs/${reference}`).then((r) => r.json()).then((body: {
      run?: { inputs?: Record<string, unknown> };
      events?: Array<{ kind: string; detail: Record<string, unknown> }>;
    }) => {
      if (!live) return;
      const out: Record<string, string> = {};
      for (const [k, v] of Object.entries(body.run?.inputs ?? {})) out[k] = String(v);
      for (const e of body.events ?? []) {
        if (e.kind === 'read') out[String(e.detail['value'])] = String(e.detail['read']);
        if (e.kind === 'read.absent') out[String(e.detail['value'])] = 'not there';
      }
      setValues(out);
    }).catch(() => undefined);
    return () => { live = false; };
  }, [reference]);
  return values;
}

export function DataStorePanel({ draft, chosen, onChoose, editable, busy, onEdit }: {
  draft: Draft; chosen: string | null; onChoose: (name: string) => void; editable: boolean; busy: boolean; onEdit: OnEdit;
}) {
  const held = heldOf(draft);
  const run = useRunValues(draft.lastRun?.reference ?? null);
  const pick = held.find((h) => h.name === chosen) ?? held[0] ?? null;
  const objects = [...new Set(held.flatMap((h) => (h.of ? [h.of.object] : [])))];
  const [rename, setRename] = useState<{ for: string; to: string }>({ for: '', to: '' });
  const [place, setPlace] = useState<{ for: string; object: string; field: string }>({ for: '', object: '', field: '' });
  const to = rename.for === pick?.name ? rename.to : pick?.name ?? '';
  const obj = place.for === pick?.name ? place.object : pick?.of?.object ?? '';
  const fld = place.for === pick?.name ? place.field : pick?.of?.field ?? pick?.name ?? '';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <PanelNote>What a run of this agent holds, as objects: each with its fields, where each comes from and what uses it. Nothing else can be written there, and a secret is only noted.</PanelNote>
      <div style={{ borderTop: '1px solid var(--ink)' }}>
        {held.length === 0 && <div style={{ padding: '8px 0' }}><PanelNote>Nothing yet: no step reads a value and nothing is given.</PanelNote></div>}
        {objectsOf(held).map((g) => (
          <div key={g.object ?? '-'} style={{ borderBottom: '1px solid var(--rule)', paddingBottom: 4 }}>
            <ObjectHeading object={g.object} />
            {g.fields.map((h) => (
              <button key={h.name} type="button" onClick={() => onChoose(h.name)}
                style={{ width: '100%', display: 'flex', gap: 10, alignItems: 'baseline', font: 'inherit', fontSize: 12.5, textAlign: 'left',
                  background: pick?.name === h.name ? 'var(--running-wash)' : 'transparent', border: 0,
                  padding: '5px 4px 5px 10px', cursor: 'pointer', color: 'var(--ink)' }}>
                <span style={{ flexGrow: 1, ...mono, fontWeight: 600 }}>{h.of?.field ?? h.name}</span>
                <span style={{ width: 42, color: 'var(--ink-2)' }}>{h.section === 'Given' ? 'given' : 'found'}</span>
                <span style={{ color: 'var(--ink-2)', ...mono, fontSize: 12 }}>{draft.lastRun ? run[h.name] ?? '—' : h.type}</span>
              </button>
            ))}
          </div>
        ))}
      </div>
      {pick && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, background: 'var(--page)', border: '1px solid var(--rule-2)', borderRadius: 5, padding: 12 }}>
          <div><span style={{ ...mono, fontSize: 15, fontWeight: 600 }}>{pick.of ? `${pick.of.object}.${pick.of.field}` : pick.name}</span>
            <span style={{ fontSize: 12.5, color: 'var(--ink-2)' }}> {pick.section} {'·'} {pick.type}{pick.mayBeAbsent ? ' · may not be there' : ''}</span></div>
          <div style={{ fontSize: 12.5 }}><span style={{ color: 'var(--ink-2)' }}>Comes from </span>{pick.from}</div>
          <div style={{ fontSize: 12.5 }}>
            <div style={{ color: 'var(--ink-2)', marginBottom: 3 }}>Used by</div>
            {pick.used.length ? pick.used.map((u) => <div key={u} style={{ padding: '3px 0', borderTop: '1px solid var(--rule)' }}>{u}</div>)
              : <div style={{ color: 'var(--ink-2)' }}>Nothing compares or publishes it: it is kept for the record.</div>}
          </div>
          {draft.lastRun && (
            <div style={{ fontSize: 12.5 }}><span style={{ color: 'var(--ink-2)' }}>In test run {draft.lastRun.reference}: </span>
              <span style={{ ...mono, fontWeight: 600 }}>{run[pick.name] ?? 'not held on that run'}</span></div>
          )}
          {editable && (
            <>
              <form onSubmit={(e) => { e.preventDefault(); void onEdit('rename-value', { from: pick.name, to }).then((ok) => ok && onChoose(to)); }}
                style={{ display: 'flex', gap: 6, alignItems: 'flex-end' }}>
                <label style={{ fontSize: 12.5, flexGrow: 1 }}>Its name<input style={{ ...field_, ...mono }} value={to}
                  onChange={(e) => setRename({ for: pick.name, to: e.target.value })} /></label>
                <button type="submit" style={plain} disabled={busy || to === pick.name}>Rename</button>
              </form>
              <form onSubmit={(e) => { e.preventDefault(); void onEdit('set-value-object', { name: pick.name, of: obj ? { object: nameFrom(obj), field: fld } : null }); }}
                style={{ display: 'flex', gap: 6, alignItems: 'flex-end' }}>
                <label style={{ fontSize: 12.5, flex: 1 }}>Object<input style={{ ...field_, ...mono }} list="datastore-objects" value={obj} placeholder="loan"
                  onChange={(e) => setPlace({ for: pick.name, object: e.target.value, field: fld })} /></label>
                <label style={{ fontSize: 12.5, flex: 1 }}>Field<input style={{ ...field_, ...mono }} value={fld}
                  onChange={(e) => setPlace({ for: pick.name, object: obj, field: e.target.value })} /></label>
                <button type="submit" style={plain} disabled={busy}>Place</button>
              </form>
              <datalist id="datastore-objects">{objects.map((o) => <option key={o} value={o} />)}</datalist>
              <PanelNote>Renaming carries through every step, rule and ending that uses it. Leave the object empty to take it out of one.</PanelNote>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export { LABEL_NAME };
