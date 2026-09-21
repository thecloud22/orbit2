/**
 * Finishing a step that was added by hand.
 *
 * Adding a step produced one that said nothing and could never be completed:
 * `editStep` existed in the API and no screen called it, so the only outcome
 * was a draft publication would refuse. This is the screen that calls it.
 *
 * What it does *not* offer is the point. There is no box for a selector, a
 * strategy or an element name, because Orbit derives how a step finds things
 * from its own view of the page (Decision 15) and a binding typed by a person
 * is the one thing that ladder exists to prevent. So the three kinds here are
 * the three decided entirely from what the draft already holds — a name, a
 * comparison over values earlier steps read, another step to go to. `read`,
 * `enter` and `activate` name something on a page, and until Orbit can show
 * an author what that page offers there is nothing honest to pick from.
 */
import { useState } from 'react';
import { Action } from '../Page.tsx';

const field: React.CSSProperties = {
  font: 'inherit', fontSize: 13.5, padding: '7px 9px', width: '100%', boxSizing: 'border-box',
  border: '1px solid var(--rule-2)', borderRadius: 4, background: 'var(--panel)', color: 'var(--ink)',
};
const label: React.CSSProperties = { display: 'block', fontSize: 12.5, color: 'var(--ink-2)', marginBottom: 4 };

/** Operators the contract carries out, by the type of the value compared. */
const OPERATORS: Record<string, Array<[string, string]>> = {
  number: [['is', 'is'], ['isNot', 'is not'], ['isMoreThan', 'is more than'],
    ['isAtLeast', 'is at least'], ['isLessThan', 'is less than'], ['isAtMost', 'is at most']],
  text: [['is', 'is'], ['isNot', 'is not'], ['contains', 'contains'], ['startsWith', 'starts with']],
  date: [['is', 'is'], ['isNot', 'is not'], ['isBefore', 'is before'], ['isAfter', 'is after']],
  yesNo: [['is', 'is'], ['isNot', 'is not']],
};

export interface Producible { name: string; type: string }
export interface Reachable { id: string; position: number; kind: string; summary: string }

/**
 * The two sides of a comparison.
 *
 * The left is always a value an earlier step produced, because a comparison
 * against something no step reads is one the run cannot carry out — the same
 * rule the authoring walk applies. The right is a constant, typed as the left
 * is: the operator set follows from the type, so an ordering operator cannot
 * be chosen against text.
 */
function Comparison({ produced, value, onChange }: {
  produced: Producible[];
  value: { left: string; operator: string; right: string };
  onChange: (v: { left: string; operator: string; right: string }) => void;
}) {
  const of = produced.find((p) => p.name === value.left)?.type ?? 'text';
  const operators = OPERATORS[of] ?? OPERATORS['text']!;

  return (
    <div style={{ display: 'flex', gap: 9, alignItems: 'flex-end' }}>
      <label style={{ flex: 1 }}>
        <span style={label}>Compare</span>
        <select style={field} value={value.left} aria-label="Value to compare"
          onChange={(e) => onChange({ ...value, left: e.target.value })}>
          <option value="">choose a value</option>
          {produced.map((p) => <option key={p.name} value={p.name}>{p.name} ({p.type})</option>)}
        </select>
      </label>
      <label style={{ width: 150 }}>
        <span style={label}>which</span>
        <select style={field} value={value.operator} aria-label="How to compare"
          onChange={(e) => onChange({ ...value, operator: e.target.value })}>
          {operators.map(([k, said]) => <option key={k} value={k}>{said}</option>)}
        </select>
      </label>
      <label style={{ flex: 1 }}>
        <span style={label}>to</span>
        <input style={field} value={value.right} aria-label="What to compare it to"
          placeholder={of === 'number' ? '620' : of === 'date' ? '2026-08-27' : 'a value'}
          onChange={(e) => onChange({ ...value, right: e.target.value })} />
      </label>
    </div>
  );
}

const comparisonOf = (v: { left: string; operator: string; right: string }, produced: Producible[]) => {
  const of = produced.find((p) => p.name === v.left)?.type ?? 'text';
  const right = of === 'number' ? { type: 'number', number: Number(v.right) }
    : of === 'date' ? { type: 'date', date: v.right }
    : of === 'yesNo' ? { type: 'yesNo', yesNo: /^(yes|true)$/i.test(v.right) }
    : { type: 'text', text: v.right };
  return { of, operator: v.operator,
    left: { from: 'step', value: v.left }, right: { from: 'literal', literal: right } };
};

export function Configure({ step, produced, reachable, busy, onSave, onCancel }: {
  step: { id: string; kind: string; position: number; declares: Record<string, unknown> };
  produced: Producible[];
  reachable: Reachable[];
  busy: boolean;
  onSave: (body: unknown) => void;
  onCancel: () => void;
}) {
  const d = step.declares;
  const [summary, setSummary] = useState(String(d['summary'] ?? ''));
  const [outcome, setOutcome] = useState(String(d['outcome'] ?? ''));
  const [publishes, setPublishes] = useState<string[]>((d['publishes'] as string[] | undefined) ?? []);
  const [otherwise, setOtherwise] = useState(String(d['otherwise'] ?? ''));
  const [ifTrue, setIfTrue] = useState(String(d['ifTrue'] ?? ''));
  const [ifFalse, setIfFalse] = useState(String(d['ifFalse'] ?? ''));
  const [compare, setCompare] = useState({ left: '', operator: 'is', right: '' });

  const missing = [
    ...(summary.trim() ? [] : ['what this step is called']),
    ...(step.kind === 'end' && !outcome.trim() ? ['a name for the conclusion'] : []),
    ...(step.kind !== 'end' && !compare.left ? ['a value to compare'] : []),
    ...(step.kind !== 'end' && !compare.right.trim() ? ['something to compare it to'] : []),
    ...(step.kind === 'check' && !otherwise.trim() ? ['what to say when it does not hold'] : []),
    ...(step.kind === 'branch' && (!ifTrue || !ifFalse) ? ['where each way goes'] : []),
  ];

  const save = () => {
    const base = { stepId: step.id, kind: step.kind, summary: summary.trim() };
    if (step.kind === 'end') return onSave({ ...base, outcome: outcome.trim(), publishes });
    if (step.kind === 'check') {
      return onSave({ ...base, that: comparisonOf(compare, produced), otherwise: otherwise.trim() });
    }
    return onSave({ ...base, when: comparisonOf(compare, produced), ifTrue, ifFalse });
  };

  return (
    <div style={{ padding: '4px 0 16px 101px', display: 'flex', flexDirection: 'column',
      gap: 13, maxWidth: 660 }}>
      <label>
        <span style={label}>What this step is called</span>
        <input style={field} value={summary} aria-label="What this step is called"
          placeholder={step.kind === 'end' ? 'Approve the file' : 'Is the credit score at least 620?'}
          onChange={(e) => setSummary(e.target.value)} />
      </label>

      {step.kind === 'end' && (
        <>
          <label>
            <span style={label}>The name a run reports</span>
            <input style={field} value={outcome} aria-label="The name a run reports"
              placeholder="approvedOutright" onChange={(e) => setOutcome(e.target.value)} />
          </label>
          {produced.length > 0 && (
            <div>
              <span style={label}>Values this conclusion carries</span>
              <div style={{ display: 'flex', gap: 13, flexWrap: 'wrap' }}>
                {produced.map((p) => (
                  <label key={p.name} style={{ display: 'flex', gap: 6, alignItems: 'center',
                    fontSize: 13, cursor: 'pointer' }}>
                    <input type="checkbox" aria-label={`Carry ${p.name}`}
                      checked={publishes.includes(p.name)}
                      onChange={(e) => setPublishes((v) =>
                        e.target.checked ? [...v, p.name] : v.filter((n) => n !== p.name))} />
                    {p.name}
                  </label>
                ))}
              </div>
              {/* Publication checks each is produced on *every* path that
                  reaches here, which this list cannot know. The gate says so
                  by name if one is not. */}
              <div style={{ fontSize: 12, color: 'var(--ink-2)', marginTop: 5 }}>
                A value only some paths read will be refused at publication, naming itself.
              </div>
            </div>
          )}
        </>
      )}

      {(step.kind === 'check' || step.kind === 'branch') && (
        <Comparison produced={produced} value={compare} onChange={setCompare} />
      )}

      {step.kind === 'check' && (
        <label>
          <span style={label}>What to say when it does not hold</span>
          <input style={field} value={otherwise} aria-label="What to say when it does not hold"
            placeholder="The file is not eligible for this program"
            onChange={(e) => setOtherwise(e.target.value)} />
        </label>
      )}

      {step.kind === 'branch' && (
        <div style={{ display: 'flex', gap: 9 }}>
          <label style={{ flex: 1 }}>
            <span style={label}>When it holds, go to</span>
            <select style={field} value={ifTrue} aria-label="When it holds, go to"
              onChange={(e) => setIfTrue(e.target.value)}>
              <option value="">choose a step</option>
              {reachable.map((s) => <option key={s.id} value={s.id}>{s.position} · {s.kind} · {s.summary}</option>)}
            </select>
          </label>
          <label style={{ flex: 1 }}>
            <span style={label}>Otherwise, go to</span>
            <select style={field} value={ifFalse} aria-label="Otherwise, go to"
              onChange={(e) => setIfFalse(e.target.value)}>
              <option value="">choose a step</option>
              {reachable.map((s) => <option key={s.id} value={s.id}>{s.position} · {s.kind} · {s.summary}</option>)}
            </select>
          </label>
        </div>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 11, paddingTop: 2 }}>
        <Action disabled={busy || missing.length > 0}
          why={`Still needed: ${[...new Set(missing)].join(', ')}`}
          onClick={save}>Save this step</Action>
        <button type="button" onClick={onCancel}
          style={{ font: 'inherit', fontSize: 13, color: 'var(--ink-2)', background: 'transparent',
            border: 0, cursor: 'pointer' }}>Leave it</button>
      </div>
    </div>
  );
}
