/**
 * The procedure editor's view of a draft (docs/plans/2026-09-22-procedure-editor.md).
 *
 * Everything here is derived from the record on every read, never stored: the
 * blocks of the document, which steps carry out which sentence, what each
 * sentence uses and finds, and how a step is said in words. A status computed
 * from facts cannot disagree with itself (§4).
 */
import { describeBinding } from '@orbit/contract';

export type Label = 'task' | 'rule' | 'forAPerson' | 'background' | 'wontDo';

export interface Sentence {
  number: string; part: string; n: number; text: string; kind: string; unterminated: boolean;
  page: number | null; label: Label | null; reason: string | null; basis: string | null;
  givenBy: string | null; waits: boolean; suspicious?: string | null; startsBlock: boolean;
  /** Set once the author has changed it (Decision 17): what it said before. */
  was?: string | null; withdrawn?: boolean; revisedAt?: string | null;
}

export interface Shot { digest?: string; withheld?: string; box?: { x: number; y: number; w: number; h: number } }

export interface Turn {
  turn: number; model: string; verdict: string; why: string;
  answered: { why: string; act?: string; element?: string | null; value?: string | null } | null;
  shown: { elements: number; page?: string }; tokens_in: number; tokens_out: number;
  screenshot?: Shot | null;
}

export interface Step {
  id: string; position: number; kind: string; declares: Record<string, unknown>; complete: boolean;
  missing: string[]; from_sentence?: string | null; made_at_turn?: number | null;
}

export interface Note {
  id: string; step_id?: string | null; kind: string; body: string; answer: string | null; resolved_at: string | null;
  sentence?: string | null; at_turn?: number | null; picture?: Shot | null;
  candidates?: Array<{ name: string; what: string }> | null; action?: string | null;
}

export interface RuleTable {
  question: string;
  columns: Array<{ name: string; label: string; readBy: string | null }>;
  rows: Array<{ when: Array<{ column: string; is: string; value: string | null }>; then: string; sentence: string }>;
  otherwise: { then: string; sentence: string | null } | null;
  sentences: string[];
}

export interface ChatMessage {
  id: string; said_by: 'author' | 'orbit'; text: string | null; state: string;
  outcome: { departs?: boolean; refused?: string; offer?: string; edits?: unknown[] } | null; answers: string | null;
}

export interface Draft {
  workflow: {
    id: string; name: string; procedure: string | null; confirmed_at: string | null;
    declared_inputs: Array<{ name: string; label: string; required: boolean; type?: string }>;
    live_version_id?: string | null; paused_at?: string | null;
  };
  steps: Step[];
  notes: Note[];
  versions: Array<{ id: string; version: number; digest: string; published_at: string;
    coverage: { total: number; byLabel: Record<string, number> } | null }>;
  authoring: { turns: Turn[]; producedNothing: number; costMicros: number; costUnknown?: boolean };
  understanding: {
    status: string; confirmed_at: string | null; examples: Record<string, string>; application: string;
    walk: string | null; session_id: string | null;
  } | null;
  document: Sentence[] | null;
  rules: RuleTable[] | null;
  chat: ChatMessage[];
  lastRun: { reference: string; status: string; outcome: string | null; version: number } | null;
  /** Sentences changed since Orbit last mapped them (R18). */
  pending?: string[];
  mapping?: { status: string; describe?: string | null; session_id?: string | null } | null;
}

/** Said the way an author thinks of it. Colour is not used for labels: a label is read, not scanned. */
export const LABEL_NAME: Record<Label, string> = {
  task: 'Orbit does this', rule: 'A rule', forAPerson: 'For a person', background: 'Background', wontDo: 'Orbit won’t',
};
export const LABEL_INK: Record<Label, string> = {
  task: 'var(--running-ink)', rule: 'var(--ink)', forAPerson: 'var(--attention-ink)', background: 'var(--ink-2)', wontDo: 'var(--ink-2)',
};

/** Sentences that are work for Orbit, or where the run waits: each should have steps. */
export const actsOn = (s: Sentence) => !s.withdrawn && (s.label === 'task' || s.label === 'rule' || (s.label === 'forAPerson' && s.waits));

export interface Block {
  /** The first sentence's number: stable for the life of a draft (R17). */
  id: string;
  type: 'heading' | 'item' | 'para' | 'orbit';
  sentences: Sentence[];
  /** The sentence that says what the block is for: the first that is not background. */
  lead: Sentence | null;
  steps: Step[];
}

/** The document's blocks, each with the steps that carry out its sentences (R2–R4). */
export function blocksOf(document: Sentence[] | null, steps: Step[]): Block[] {
  const blocks: Block[] = [];
  for (const s of document ?? []) {
    if (s.startsBlock || !blocks.length) {
      blocks.push({ id: s.number, type: s.kind === 'heading' ? 'heading' : s.kind === 'item' ? 'item' : 'para',
        sentences: [s], lead: null, steps: [] });
    } else {
      blocks.at(-1)!.sentences.push(s);
    }
  }
  const home = new Map<string, Block>();
  for (const b of blocks) {
    b.lead = b.sentences.find((x) => x.label && x.label !== 'background') ?? null;
    for (const s of b.sentences) home.set(s.number, b);
  }
  // Steps no sentence asks for — opening the application, how it finishes,
  // anything a person added — are still steps, so they have a home too (R6).
  const orbit: Block = { id: 'orbit', type: 'orbit', sentences: [], lead: null, steps: [] };
  for (const step of steps) {
    const b = step.from_sentence ? home.get(step.from_sentence) : undefined;
    (b ?? orbit).steps.push(step);
  }
  if (orbit.steps.length) blocks.push(orbit);
  return blocks;
}

const OPERATORS: Record<string, string> = {
  is: 'is', isNot: 'is not', contains: 'contains', startsWith: 'starts with',
  isMoreThan: 'is more than', isAtLeast: 'is at least', isLessThan: 'is less than', isAtMost: 'is at most',
  isBefore: 'is before', isAfter: 'is after', isAbsent: 'is not there', isNotAbsent: 'is there',
};

/** A value a step names, in words: an input, a value read earlier, a fixed value, the registered account. */
export function valueWords(r: unknown): string {
  const v = r as { from?: string; value?: string; credential?: string; literal?: Record<string, unknown> } | undefined;
  if (v?.from === 'step') return v.value ?? 'a value';
  if (v?.from === 'input') return v.value ?? 'an input';
  if (v?.from === 'account') return 'the registered account';
  // The credential's name is the registry's handle for it, not something a person reads.
  if (v?.from === 'secret') return 'the registered password';
  if (v?.from === 'column') return `the row's ${v.value ?? 'value'}`;
  if (v?.from === 'literal') {
    const l = v.literal ?? {};
    const shown = l['text'] ?? l['number'] ?? l['date'] ?? (l['yesNo'] === undefined ? '' : l['yesNo'] ? 'yes' : 'no');
    return `“${String(shown)}”`;
  }
  return 'nothing';
}

/** The one thing on the page a step acts on, if it acts on one. */
export function targetOf(d: Record<string, unknown>): { label: string; binding: unknown } | null {
  for (const k of ['region', 'into', 'control', 'table']) {
    const t = d[k] as { label?: string; binding?: unknown } | undefined;
    if (t?.label) return { label: t.label, binding: t.binding };
  }
  return null;
}

/** A step said from its structure, never from text a model wrote (R5). */
export function sayStep(step: Step, positionOf: (id: unknown) => number | null): string {
  const d = step.declares;
  const target = targetOf(d);
  const at = (id: unknown) => { const p = positionOf(id); return p ? `step ${p}` : 'the end'; };
  switch (step.kind) {
    case 'open': return `Opens ${String(d['path'] ?? 'the application')}`;
    case 'enter': return `Types ${valueWords(d['value'])} into ${target?.label ?? 'a field'}`;
    case 'activate': return `Presses ${target?.label ?? 'a control'}${d['changesARecord'] ? ', which changes a record' : ''}`;
    case 'read': {
      const p = d['produces'] as { name?: string; type?: string; required?: boolean } | undefined;
      return `Reads ${target?.label ?? 'a value'} into ${p?.name ?? '?'}${p?.required === false ? ', which may not be there' : ''}`;
    }
    case 'branch': case 'check': {
      const c = (step.kind === 'branch' ? d['when'] : d['that']) as
        { of?: string; operator?: string; left?: unknown; right?: unknown } | undefined;
      const test = `${valueWords(c?.left)} ${OPERATORS[c?.operator ?? ''] ?? c?.operator ?? '?'}${c?.of === 'absence' ? '' : ` ${valueWords(c?.right)}`}`;
      return step.kind === 'branch'
        ? `If ${test}, go to ${at(d['ifTrue'])}; otherwise ${at(d['ifFalse'])}`
        : `Checks that ${test}`;
    }
    case 'end': {
      const publishes = (d['publishes'] as string[] | undefined) ?? [];
      return `Finishes as “${String(d['outcome'] ?? 'unnamed')}”${publishes.length ? `, handing back ${publishes.join(', ')}` : ''}`;
    }
    case 'handOff': return `${d['waits'] ? 'Waits for a person' : 'Hands to a person'}: ${String(d['request'] ?? '')}`;
    default: return String(d['summary'] ?? step.kind);
  }
}

/** The element a step acts on, in words, as its binding says it is found (R5). */
export function elementWords(step: Step): string | null {
  if (step.missing.length) return 'not configured yet';
  const target = targetOf(step.declares);
  if (target) return describeBinding(target.binding);
  if (step.kind === 'open') return 'an address in the registered application';
  if (step.kind === 'branch' || step.kind === 'check') return 'nothing on a page: a decision between values already read';
  if (step.kind === 'end') return 'nothing on a page: the run ends here';
  if (step.kind === 'handOff') return 'nothing on a page: a person does this';
  return null;
}

/** What a block's steps use and find: the values under a sentence (R4). */
export function valuesOf(steps: Step[]): Array<{ verb: string; name: string; kind: 'input' | 'found' | 'secret' | 'compared' | 'published' }> {
  const out: Array<{ verb: string; name: string; kind: 'input' | 'found' | 'secret' | 'compared' | 'published' }> = [];
  const add = (verb: string, name: string, kind: typeof out[number]['kind']) => {
    if (!out.some((x) => x.name === name && x.kind === kind)) out.push({ verb, name, kind });
  };
  for (const s of steps) {
    const d = s.declares;
    if (s.kind === 'enter') {
      const v = d['value'] as { from?: string; value?: string; credential?: string } | undefined;
      if (v?.from === 'input' && v.value) add('uses', v.value, 'input');
      if (v?.from === 'step' && v.value) add('uses', v.value, 'found');
      if (v?.from === 'secret') add('uses', 'the registered password', 'secret');
    }
    if (s.kind === 'read') {
      const p = d['produces'] as { name?: string } | undefined;
      if (p?.name) add('finds', p.name, 'found');
    }
    if (s.kind === 'branch' || s.kind === 'check') {
      const c = (s.kind === 'branch' ? d['when'] : d['that']) as { left?: { from?: string; value?: string } } | undefined;
      if (c?.left?.value && (c.left.from === 'step' || c.left.from === 'input')) add('compares', c.left.value, 'compared');
    }
    if (s.kind === 'end') for (const p of (d['publishes'] as string[] | undefined) ?? []) add('hands back', p, 'published');
  }
  return out;
}

/** Every value a run of this draft will hold in its DataStore, with where it comes from and what uses it. */
export interface Held { section: 'Given' | 'Found'; name: string; type: string; from: string; used: string[]; mayBeAbsent?: boolean }

export function heldOf(draft: Draft): Held[] {
  const steps = draft.steps;
  const out: Held[] = [];
  const usesOf = (name: string) => steps.flatMap((s) => {
    const d = s.declares;
    const where = `step ${s.position}${s.from_sentence ? ` (${s.from_sentence})` : ''}`;
    if (s.kind === 'enter' && (d['value'] as { value?: string } | undefined)?.value === name) return [`${where}: typed into ${targetOf(d)?.label ?? 'a field'}`];
    if (s.kind === 'branch' || s.kind === 'check') {
      const c = (s.kind === 'branch' ? d['when'] : d['that']) as { left?: { value?: string }; right?: { value?: string } } | undefined;
      if (c?.left?.value === name || c?.right?.value === name) return [`${where}: compared`];
    }
    if (s.kind === 'end' && ((d['publishes'] as string[] | undefined) ?? []).includes(name)) return [`${where}: handed back as “${String(d['outcome'] ?? '')}”`];
    if (s.kind === 'handOff' && JSON.stringify(d['show'] ?? []).includes(`"${name}"`)) return [`${where}: shown to a person`];
    return [];
  });
  for (const i of draft.workflow.declared_inputs ?? []) {
    out.push({ section: 'Given', name: i.name, type: i.type ?? 'text', from: 'asked for when a run starts', used: usesOf(i.name) });
  }
  for (const s of steps) {
    if (s.kind !== 'read') continue;
    const p = s.declares['produces'] as { name?: string; type?: string; required?: boolean; label?: string } | undefined;
    if (!p?.name || out.some((x) => x.name === p.name)) continue;
    out.push({ section: 'Found', name: p.name, type: p.type ?? 'text',
      from: `step ${s.position}${s.from_sentence ? ` (${s.from_sentence})` : ''}: ${p.label ?? targetOf(s.declares)?.label ?? ''}`,
      used: usesOf(p.name), mayBeAbsent: p.required === false });
  }
  return out;
}
