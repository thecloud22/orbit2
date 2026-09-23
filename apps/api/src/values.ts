/**
 * Values, edited on the procedure editor's Inputs, Outputs and DataStore tabs
 * (plan R8–R13, R26).
 *
 * A value is picked, or it is fixed: every request here names values by their
 * contract name, so there is nowhere to write `{loanNumber}` or `ltv + 1` —
 * the schema refuses it before anything is looked at (Decision 14 item 3).
 * Each edit is gated as the other draft edits are: it may leave the draft as
 * broken as it found it, never worse, and it lapses a confirmation (§4).
 *
 * `workflow.declared_inputs` stops being written once (docs/TODO.md, "An answer
 * to a question changes nothing"): an author can now make a fixed value an
 * input, and act on their own answer.
 */
import type { PoolClient } from 'pg';
import { fieldOf, literal, name, object, valueType, z, type Step } from '@orbit/contract';
import { madeWorse, returnToDraft, stepsOf, why, wouldBreak } from './edit.ts';

export type ValueEdit = { ok: true } | { ok: false; because: string };

interface Input { name: string; label: string; type: string; required: boolean; of?: { object: string; field: string } }

const refuse = (because: string): ValueEdit => ({ ok: false, because });
const said = (e: z.ZodError) => e.issues.map((i) => `${i.path.join('.') || 'the request'}: ${i.message}`).join('; ');

/** A type an input can be given as: a list of rows is collected from a screen, never given. */
const givenType = valueType.exclude(['listOfRows']);

interface State {
  inputs: Input[];
  examples: Record<string, string> | null;
  steps: Array<{ id: string; position: number; kind: string; declares: Record<string, unknown>; from_sentence: string | null }>;
  outcomes: string[];
  live: boolean;
}

async function stateOf(db: PoolClient, workflowId: string): Promise<State | null> {
  const { rows: [w] } = await db.query<{ declared_inputs: Input[]; outcomes: Array<{ name: string }> | null; live_version_id: string | null }>(
    `SELECT coalesce(declared_inputs, '[]'::jsonb) AS declared_inputs, outcomes, live_version_id FROM workflow WHERE id = $1 FOR UPDATE`,
    [workflowId]);
  if (!w) return null;
  const { rows: [u] } = await db.query<{ inputs: Record<string, string> }>(
    `SELECT inputs FROM understanding WHERE workflow_id = $1`, [workflowId]);
  const { rows: steps } = await db.query<State['steps'][number]>(
    `SELECT id, position, kind, declares, from_sentence FROM workflow_step WHERE workflow_id = $1 ORDER BY position`, [workflowId]);
  return { inputs: w.declared_inputs, examples: u?.inputs ?? null, steps,
    outcomes: (w.outcomes ?? []).map((o) => o.name), live: Boolean(w.live_version_id) };
}

/** Every value name in the draft, and every object field, so nothing is named twice. */
function taken(state: State) {
  const names = new Map<string, string>();
  const fields = new Map<string, string>();
  for (const i of state.inputs) {
    names.set(i.name, 'an input');
    if (i.of) fields.set(`${i.of.object}.${i.of.field}`, i.name);
  }
  for (const s of state.steps) {
    const p = s.declares['produces'] as { name?: string; of?: { object: string; field: string } } | undefined;
    if (s.kind === 'read' && p?.name) {
      names.set(p.name, `the value step ${s.position} reads`);
      if (p.of) fields.set(`${p.of.object}.${p.of.field}`, p.name);
    }
  }
  return { names, fields };
}

/** Where a value is used, by step position, for a refusal that names them. */
function usedAt(state: State, value: string, from: 'input' | 'step'): number[] {
  const needle = (x: unknown): boolean => {
    if (Array.isArray(x)) return x.some(needle);
    if (x && typeof x === 'object') {
      const o = x as Record<string, unknown>;
      if (o['from'] === from && o['value'] === value) return true;
      return Object.values(o).some(needle);
    }
    return false;
  };
  return state.steps.filter((s) => needle(s.declares)
    || (s.kind === 'end' && ((s.declares['publishes'] as string[] | undefined) ?? []).includes(value)))
    .map((s) => s.position);
}

async function write(db: PoolClient, workflowId: string, state: State, what: string, audit: Record<string, unknown>,
  changes: { inputs?: Input[]; examples?: Record<string, string>; steps?: Map<string, Record<string, unknown>> }) {
  await db.query('BEGIN');
  try {
    if (changes.inputs) {
      await db.query(`UPDATE workflow SET declared_inputs = $2, updated_at = now() WHERE id = $1`,
        [workflowId, JSON.stringify(changes.inputs)]);
    }
    if (changes.examples && state.examples !== null) {
      await db.query(`UPDATE understanding SET inputs = $2 WHERE workflow_id = $1`, [workflowId, JSON.stringify(changes.examples)]);
    }
    for (const [id, declares] of changes.steps ?? []) {
      await db.query(`UPDATE workflow_step SET declares = $2 WHERE id = $1 AND workflow_id = $3`, [id, JSON.stringify(declares), workflowId]);
    }
    await returnToDraft(db, workflowId, what);
    await db.query(`INSERT INTO audit_entry (act, object_kind, object_id, changed) VALUES ($1, 'workflow', $2, $3)`,
      [what.toLowerCase(), workflowId, JSON.stringify(audit)]);
    await db.query('COMMIT');
  } catch (error) { await db.query('ROLLBACK'); throw error; }
}

async function editable(db: PoolClient, workflowId: string): Promise<State | ValueEdit> {
  const state = await stateOf(db, workflowId);
  if (!state) return refuse('There is no such draft.');
  if (state.live) return refuse('A version of this agent is live. Its values are fixed in that version; change the draft for the next one.');
  return state;
}

// ─── Inputs (R10, R13) ──────────────────────────────────────────────────────

export const declareInputAsked = object({
  name, label: z.string().trim().min(1).max(120), type: givenType.default('text'), required: z.boolean().default(true),
  /** What a test run is given. Changing it does not redraft (R13). */
  example: z.string().max(4096).optional(),
  of: fieldOf.optional(),
});

export async function declareInput(db: PoolClient, workflowId: string, body: unknown): Promise<ValueEdit> {
  const asked = declareInputAsked.safeParse(body);
  if (!asked.success) return refuse(`That input was not declared: ${said(asked.error)}.`);
  const state = await editable(db, workflowId);
  if ('ok' in state) return state;
  const { names, fields } = taken(state);
  const a = asked.data;
  if (names.has(a.name)) return refuse(`${a.name} is already the name of ${names.get(a.name)}. Two things in the DataStore cannot share a name.`);
  if (a.of && fields.has(`${a.of.object}.${a.of.field}`)) {
    return refuse(`${a.of.object} already has a field called ${a.of.field} (${fields.get(`${a.of.object}.${a.of.field}`)}).`);
  }
  const input: Input = { name: a.name, label: a.label, type: a.type, required: a.required, ...(a.of ? { of: a.of } : {}) };
  await write(db, workflowId, state, 'Input declared', { name: a.name },
    { inputs: [...state.inputs, input], ...(a.example !== undefined ? { examples: { ...(state.examples ?? {}), [a.name]: a.example } } : {}) });
  return { ok: true };
}

export const changeInputAsked = object({
  name, label: z.string().trim().min(1).max(120).optional(), type: givenType.optional(), required: z.boolean().optional(),
  example: z.string().max(4096).optional(),
});

export async function changeInput(db: PoolClient, workflowId: string, body: unknown): Promise<ValueEdit> {
  const asked = changeInputAsked.safeParse(body);
  if (!asked.success) return refuse(`That input was not changed: ${said(asked.error)}.`);
  const state = await editable(db, workflowId);
  if ('ok' in state) return state;
  const a = asked.data;
  const found = state.inputs.find((i) => i.name === a.name);
  if (!found) return refuse(`There is no input called ${a.name}.`);
  const changed: Input = { ...found, ...(a.label ? { label: a.label } : {}), ...(a.type ? { type: a.type } : {}),
    ...(a.required !== undefined ? { required: a.required } : {}) };
  await write(db, workflowId, state, 'Input changed', { name: a.name },
    { inputs: state.inputs.map((i) => (i.name === a.name ? changed : i)),
      ...(a.example !== undefined ? { examples: { ...(state.examples ?? {}), [a.name]: a.example } } : {}) });
  return { ok: true };
}

export async function removeInput(db: PoolClient, workflowId: string, body: unknown): Promise<ValueEdit> {
  const asked = object({ name }).safeParse(body);
  if (!asked.success) return refuse('Say which input to remove.');
  const state = await editable(db, workflowId);
  if ('ok' in state) return state;
  if (!state.inputs.some((i) => i.name === asked.data.name)) return refuse(`There is no input called ${asked.data.name}.`);
  const at = usedAt(state, asked.data.name, 'input');
  if (at.length) {
    return refuse(`${asked.data.name} cannot be removed: step${at.length === 1 ? '' : 's'} ${at.join(', ')} use${at.length === 1 ? 's' : ''} it. Change ${at.length === 1 ? 'that step' : 'those steps'} first.`);
  }
  const examples = { ...(state.examples ?? {}) };
  delete examples[asked.data.name];
  await write(db, workflowId, state, 'Input removed', { name: asked.data.name },
    { inputs: state.inputs.filter((i) => i.name !== asked.data.name), examples });
  return { ok: true };
}

// ─── What a step types (R8, R10: "Use an input here") ───────────────────────

/** Picked, or fixed. A step's value is never a string somebody wrote a reference into. */
export const setStepValueAsked = object({
  stepId: z.uuid(),
  value: z.discriminatedUnion('from', [
    object({ from: z.literal('input'), value: name }),
    object({ from: z.literal('step'), value: name }),
    object({ from: z.literal('literal'), literal }),
  ]),
});

export async function setStepValue(db: PoolClient, workflowId: string, body: unknown): Promise<ValueEdit> {
  const asked = setStepValueAsked.safeParse(body);
  if (!asked.success) return refuse(`Nothing was changed: ${said(asked.error)}. A value is picked from the list, or typed as a fixed value.`);
  const state = await editable(db, workflowId);
  if ('ok' in state) return state;
  const step = state.steps.find((s) => s.id === asked.data.stepId);
  if (!step) return refuse('There is no such step in this draft.');
  if (step.kind !== 'enter') return refuse(`Step ${step.position} does not type anything, so it has no value to change.`);
  const current = step.declares['value'] as { from?: string } | undefined;
  if (current?.from === 'secret' || current?.from === 'account') {
    return refuse(`Step ${step.position} is the sign-in. It types the registered ${current.from === 'secret' ? 'password' : 'account'}, and nothing else may go there.`);
  }
  const value = asked.data.value;
  if (value.from === 'input' && !state.inputs.some((i) => i.name === value.value)) {
    return refuse(`There is no input called ${value.value}. Declare it first, on the Inputs tab.`);
  }
  const into = (step.declares['into'] as { label?: string } | undefined)?.label ?? 'the field';
  const puts = value.from === 'literal' ? (value.literal.type === 'text' ? value.literal.text : String(Object.values(value.literal)[1])) : value.value;
  const declares = { ...step.declares, value, summary: `${puts}, into ${into}` };

  // Checked as the other edits are: a value read later cannot be typed here.
  const before = await stepsOf(db, workflowId);
  const after = before.map((s) => (s.id === step.id ? ({ ...(s as Step), value } as never) : s));
  const inputs = state.inputs.map((i) => i.name);
  const broken = madeWorse(wouldBreak(before, state.outcomes, inputs), wouldBreak(after, state.outcomes, inputs));
  if (broken) return refuse(why('Typing that there', broken));

  await write(db, workflowId, state, 'Step value changed', { step: step.position, value },
    { steps: new Map([[step.id, declares]]) });
  return { ok: true };
}

// ─── Renaming, objects, outputs (R11, R12, R26) ─────────────────────────────

/** Every place a value's name appears in a step, renamed. */
function renamedIn(x: unknown, from: string, to: string): unknown {
  if (Array.isArray(x)) return x.map((y) => (y === from ? to : renamedIn(y, from, to)));
  if (x && typeof x === 'object') {
    const o = x as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(o)) {
      const isRef = (k === 'value' && (o['from'] === 'input' || o['from'] === 'step'))
        || (k === 'name' && ('label' in o) && ('type' in o));
      out[k] = isRef && v === from ? to : renamedIn(v, from, to);
    }
    return out;
  }
  return x;
}

export async function renameValue(db: PoolClient, workflowId: string, body: unknown): Promise<ValueEdit> {
  const asked = object({ from: name, to: name }).safeParse(body);
  if (!asked.success) return refuse(`Nothing was renamed: ${said(asked.error)}.`);
  const { from, to } = asked.data;
  if (from === to) return refuse('That is already its name.');
  const state = await editable(db, workflowId);
  if ('ok' in state) return state;
  const { names } = taken(state);
  if (!names.has(from)) return refuse(`Nothing in this draft is called ${from}.`);
  if (names.has(to)) return refuse(`${to} is already the name of ${names.get(to)}. Two things in the DataStore cannot share a name.`);

  const steps = new Map<string, Record<string, unknown>>();
  for (const s of state.steps) {
    const renamed = renamedIn(s.declares, from, to) as Record<string, unknown>;
    if (JSON.stringify(renamed) !== JSON.stringify(s.declares)) steps.set(s.id, renamed);
  }
  const examples = state.examples ? Object.fromEntries(Object.entries(state.examples).map(([k, v]) => [k === from ? to : k, v])) : undefined;
  await write(db, workflowId, state, 'Value renamed', { from, to, steps: steps.size },
    { inputs: state.inputs.map((i) => (i.name === from ? { ...i, name: to } : i)), ...(examples ? { examples } : {}), steps });
  return { ok: true };
}

/** Which object a value is a field of, or none (R26). */
export async function setValueObject(db: PoolClient, workflowId: string, body: unknown): Promise<ValueEdit> {
  const asked = object({ name, of: fieldOf.nullable() }).safeParse(body);
  if (!asked.success) return refuse(`Nothing was changed: ${said(asked.error)}.`);
  const { name: value, of } = asked.data;
  const state = await editable(db, workflowId);
  if ('ok' in state) return state;
  const { names, fields } = taken(state);
  if (!names.has(value)) return refuse(`Nothing in this draft is called ${value}.`);
  if (of && fields.has(`${of.object}.${of.field}`) && fields.get(`${of.object}.${of.field}`) !== value) {
    return refuse(`${of.object} already has a field called ${of.field} (${fields.get(`${of.object}.${of.field}`)}).`);
  }
  const place = <T extends object>(v: T): T => {
    const { of: _, ...rest } = v as T & { of?: unknown };
    return (of ? { ...rest, of } : rest) as T;
  };
  const steps = new Map<string, Record<string, unknown>>();
  for (const s of state.steps) {
    const p = s.declares['produces'] as { name?: string } | undefined;
    if (s.kind === 'read' && p?.name === value) steps.set(s.id, { ...s.declares, produces: place(p) });
  }
  await write(db, workflowId, state, 'Value placed in an object', { name: value, of },
    { inputs: state.inputs.map((i) => (i.name === value ? place(i) : i)), steps });
  return { ok: true };
}

/** What an ending hands back: only values found on every path to it (R11). */
export async function setPublishes(db: PoolClient, workflowId: string, body: unknown): Promise<ValueEdit> {
  const asked = object({ stepId: z.uuid(), publishes: z.array(name).max(32) }).safeParse(body);
  if (!asked.success) return refuse(`Nothing was changed: ${said(asked.error)}.`);
  const state = await editable(db, workflowId);
  if ('ok' in state) return state;
  const step = state.steps.find((s) => s.id === asked.data.stepId);
  if (!step || step.kind !== 'end') return refuse('That is not an ending of this draft.');
  const publishes = [...new Set(asked.data.publishes)];
  const before = await stepsOf(db, workflowId);
  const after = before.map((s) => (s.id === step.id ? ({ ...(s as Step), publishes } as never) : s));
  // A value found on only some of the paths to this ending cannot be handed back
  // by it: publication would refuse, so the edit does too.
  const inputs = state.inputs.map((i) => i.name);
  const broken = madeWorse(wouldBreak(before, state.outcomes, inputs), wouldBreak(after, state.outcomes, inputs));
  if (broken) return refuse(why(`Handing ${publishes.join(', ')} back`, broken));
  await write(db, workflowId, state, 'Outputs changed', { step: step.position, publishes },
    { steps: new Map([[step.id, { ...step.declares, publishes }]]) });
  return { ok: true };
}
