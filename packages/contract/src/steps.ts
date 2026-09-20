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
