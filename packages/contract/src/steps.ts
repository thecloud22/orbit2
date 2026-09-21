/**
 * The ten kinds of step. Decision 14 item 1.
 *
 * Every step is one of these and there is no eleventh, which is what makes it
 * possible to say of any published version what it could not have done. Adding
 * a kind is a decision with a requirement behind it, not a ticket — and it
 * changes five things at once: this union, the editor's forms, the executor's
 * dispatch, the run page's per-step detail, and the acceptance vocabulary.
 *
 * Kinds are named in business terms and say nothing about a surface (§7): the
 * registered application decides whether "press this" is a click or a function
 * key, never the step.
 */
import { object, name, z } from './zod.ts';
import { comparison, declaredValue, enterValue, valueRef, valueType } from './values.ts';

/**
 * How a step names something on a page.
 *
 * The one hole left in Decision 14, and deliberately opaque until it is settled
 * by measurement against `apps/legacy-portal` rather than by argument. It is a
 * single column on a step and reaches nothing else — not the run tables, the
 * audit chain, the evidence store or the editor — so everything around it can
 * be built, migrated and tested while it is still a placeholder.
 */
export const target = object({
  /** What a person calls it, and what a refusal names. */
  label: z.string().min(1).max(160),
  /** Filled in when the ladder is measured. Opaque on purpose for now. */
  binding: z.unknown(),
});
export type Target = z.infer<typeof target>;

/** What must be true for a navigation or an activation to count as having worked. */
export const expectation = object({
  describe: z.string().min(1).max(200),
  target: target.optional(),
});

const base = { id: z.uuid(), summary: z.string().min(1).max(200) };

/**
 * `changesARecord` appears on `open` as well as `activate` because an old
 * application will happily change something on a GET. §7 requires that, absent
 * granted authority, a step which would change something is compiled into a
 * hand off — and Orbit cannot obey that while it cannot tell Search from
 * Submit. The compilation happens at publication, so the immutable version
 * already contains the hand off and nothing decides it at run time.
 */
export const step = z.discriminatedUnion('kind', [
  object({
    ...base, kind: z.literal('open'),
    application: name,
    path: z.string().min(1).max(2048),
    arrives: expectation,
    changesARecord: z.boolean(),
  }),
  object({
    ...base, kind: z.literal('enter'),
    into: target,
    value: enterValue,
    sensitive: z.boolean(),
  }),
  object({
    ...base, kind: z.literal('activate'),
    control: target,
    then: expectation,
    changesARecord: z.boolean(),
  }),
  object({
    ...base, kind: z.literal('read'),
    region: target,
    produces: declaredValue,
  }),
  object({
    ...base, kind: z.literal('collect'),
    table: target,
    columns: z.array(object({ heading: z.string().min(1).max(120), produces: declaredValue })).min(1).max(32),
    into: name,
    mostRows: z.number().int().positive().max(10_000),
  }),
  object({
    ...base, kind: z.literal('check'),
    that: comparison,
    otherwise: z.string().min(1).max(200),
  }),
  object({
    ...base, kind: z.literal('branch'),
    /** Two-way. A switch hides nine outcomes in one step and makes §10's
     *  "show both operands exactly as they arrived" hard to render honestly. */
    when: comparison,
    ifTrue: z.uuid(),
    ifFalse: z.uuid(),
  }),
  object({
    ...base, kind: z.literal('forEach'),
    list: valueRef,
    rowNamed: name,
    steps: z.array(z.uuid()).min(1),
    /** Checked before the first pass. Sixty rows against a ceiling of fifty
     *  halts naming both, rather than doing fifty and abandoning ten. */
    mostPasses: z.number().int().positive().max(10_000),
  }),
  object({
    ...base, kind: z.literal('handOff'),
    /** In the author's own words — it is what the person is shown. */
    request: z.string().min(1).max(1000),
    show: z.array(valueRef).max(16),
    handsBack: z.array(declaredValue).max(8),
  }),
  object({
    ...base, kind: z.literal('end'),
    outcome: name,
    publishes: z.array(name).max(32),
  }),
]);
export type Step = z.infer<typeof step>;
export type StepKind = Step['kind'];

/** Every kind, for an editor that offers them and a test that covers them all. */
export const STEP_KINDS = [
  'open', 'enter', 'activate', 'read', 'collect',
  'check', 'branch', 'forEach', 'handOff', 'end',
] as const satisfies readonly StepKind[];

/** Kinds that may name something on a page, and so may fail to resolve it. */
export const KINDS_THAT_BIND = ['open', 'enter', 'activate', 'read', 'collect'] as const;

/** Kinds that end a path. Publication refuses a path that reaches none of them. */
export const KINDS_THAT_END = ['end', 'handOff'] as const;

/** A business conclusion, fixed at publication. A run cannot invent another. */
export const outcome = object({
  name,
  label: z.string().min(1).max(120),
  describe: z.string().max(400).optional(),
});
export type Outcome = z.infer<typeof outcome>;

export { valueType };

/**
 * How a step finds the thing it acts on, said in words.
 *
 * The interface showed only the strategy — "by structural" — which names the
 * rung of Decision 15's ladder and tells a reader nothing about what will
 * actually be touched. The whole claim is that you can be sure the agent could
 * not have done anything else, and that is unreadable if the binding is a word
 * nobody outside this codebase knows.
 *
 * Kept here rather than in the screen that renders it, because the run page,
 * the draft and a refusal must not describe the same binding three ways.
 */
export interface BindingShape {
  strategy?: string;
  name?: string;
  role?: string;
  row?: string;
  column?: string;
  frame?: string;
  within?: { frame?: string };
  corroborate?: { tag?: string; text?: string };
}

/**
 * What a step does not say yet, in the words the product uses everywhere else.
 *
 * A schema message is written for whoever wrote the schema. "expected object,
 * received undefined" describes a field path in a discriminated union to
 * somebody who wrote a sentence about a loan file — true, precise, and nothing
 * they can act on. So the field is named plainly and the schema's own wording
 * is dropped rather than appended.
 *
 * It lives here, beside `describeBinding`, because three places have to say
 * the same thing about the same hole: the draft screen showing an unconfigured
 * step, the refusal when a reading could not be stored, and the publish gate
 * naming what blocks it. Said in three places it was said three ways — and in
 * one of them not at all: the draft screen interpolated the field straight
 * into a sentence and printed "undefined (undefined)".
 */
const PLAINLY: Record<string, string> = {
  // what a step acts on
  into: 'what on the page this puts a value into',
  control: 'what on the page this presses',
  region: 'what on the page this reads',
  table: 'which table on the page this reads',
  list: 'which list of rows this goes through',
  // what it carries
  value: 'what goes into that field',
  produces: 'what the value it reads is called',
  publishes: 'which values the conclusion carries',
  outcome: 'the name of the conclusion it reaches',
  columns: 'which columns to keep',
  rowNamed: 'what each row is called while it is being worked on',
  steps: 'what to do for each row',
  // what must be true
  then: 'what should be true once this has been done',
  arrives: 'what should be true once the page has opened',
  when: 'what is being compared',
  that: 'what is being checked',
  otherwise: 'what happens when the check does not hold',
  // where it goes
  path: 'where to go',
  application: 'which system this happens in',
  ifTrue: 'which step follows when it holds',
  ifFalse: 'which step follows when it does not',
  // limits and flags
  changesARecord: 'whether doing this commits anything',
  sensitive: 'whether what goes in is a secret',
  mostRows: 'how many rows at most',
  mostPasses: 'how many passes at most',
  // handing over
  request: 'what the person is being asked to do',
  show: 'what the person is shown',
  handsBack: 'what the person hands back',
  summary: 'what this step is called',
};

export function describeMissing(field: string): string {
  return PLAINLY[field] ?? (field ? `its ${field}` : 'a shape Orbit can carry out');
}

/** The same, as a sentence, for a step that is missing several things. */
export function describeMissingAll(fields: string[]): string {
  const said = [...new Set(fields)].map(describeMissing);
  if (said.length === 0) return 'It is not a shape Orbit can carry out.';
  if (said.length === 1) return `It does not say ${said[0]}.`;
  return `It does not say ${said.slice(0, -1).join(', ')} or ${said.at(-1)}.`;
}

export function describeBinding(binding: unknown): string {
  const b = (binding ?? {}) as BindingShape;
  const named = b.name ? `“${b.name}”` : 'something unnamed';

  const how =
    b.strategy === 'roleAndName' ? `the ${b.role ?? 'control'} named ${named}`
    : b.strategy === 'label' ? `the field labelled ${named}`
    : b.strategy === 'formName' ? `the field the page calls ${named} internally`
    : b.strategy === 'controlBeside' ? `the control sitting beside ${named}`
    : b.strategy === 'rowAndColumn' ? `the cell where row “${b.row ?? '?'}” meets column “${b.column ?? '?'}”`
    : b.strategy === 'structural' ? `whatever sits immediately after the label ${named}`
    : b.strategy === 'text' ? `the text ${named}`
    : 'nothing yet — this step is not configured';

  // Corroboration is not a detail. It is the difference between a rung that
  // may return the wrong element and one that is allowed to be published, so
  // it is said in the same breath rather than tucked away.
  const also = b.corroborate?.tag && b.corroborate.text
    ? `, and it must be a <${b.corroborate.tag}> containing “${b.corroborate.text}”`
    : b.corroborate?.tag ? `, and it must be a <${b.corroborate.tag}>`
    : b.corroborate?.text ? `, and it must contain “${b.corroborate.text}”`
    : '';

  const where = b.within?.frame ? ` inside the frame “${b.within.frame}”` : '';
  return `${how}${where}${also}`;
}
