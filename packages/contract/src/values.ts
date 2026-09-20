/**
 * Value types, comparisons, and the five things that may stand where a step
 * expects a value. Decision 14, items 2 and 3.
 */
import { object, name, z } from './zod.ts';

/** Five types. Not money, not a reference, not a time — Decision 14 item 2. */
export const valueType = z.enum(['text', 'number', 'date', 'yesNo', 'listOfRows']);
export type ValueType = z.infer<typeof valueType>;

/**
 * An operator belongs to a type, so "is more than" is unrepresentable on text.
 * What remains for publication to check is only whether the values named are
 * of the type the comparison claims.
 */
export const textOperator = z.enum(['is', 'isNot', 'contains', 'startsWith']);
export const numberOperator = z.enum(['is', 'isNot', 'isMoreThan', 'isAtLeast', 'isLessThan', 'isAtMost']);
export const dateOperator = z.enum(['is', 'isNot', 'isBefore', 'isAfter']);
export const yesNoOperator = z.enum(['is', 'isNot']);
export const listOperator = z.enum(['hasRows', 'hasNoRows', 'rowCountIs', 'rowCountIsAtLeast']);

/**
 * Absence is a state, not a member of any type (Decision 14 item 2). It is the
 * only comparison that may be made against a value which was never produced —
 * every other one halts. Without it, "there was no record" and "the record said
 * nothing" collapse into each other.
 */
export const absenceOperator = z.enum(['isAbsent', 'isNotAbsent']);

/** A literal is a constant in an immutable version, not an expression. */
export const literal = z.discriminatedUnion('type', [
  object({ type: z.literal('text'), text: z.string().max(4096) }),
  object({ type: z.literal('number'), number: z.number().finite() }),
  object({ type: z.literal('date'), date: z.iso.date() }),
  object({ type: z.literal('yesNo'), yesNo: z.boolean() }),
]);
export type Literal = z.infer<typeof literal>;

/**
 * The four references any step may use. A secret is deliberately not here: it
 * is accepted in exactly one field of one step kind, so rule 8 holds by the
 * shape of the types rather than by a check somebody has to remember to write.
 */
export const valueRef = z.discriminatedUnion('from', [
  /** Supplied when the run starts. */
  object({ from: z.literal('input'), value: name }),
  /** Produced by an earlier step — publication checks "earlier on every path". */
  object({ from: z.literal('step'), value: name }),
  /** A column of the row being processed. Only inside a `for each` pass. */
  object({ from: z.literal('row'), row: name, column: name }),
  /** A constant. */
  object({ from: z.literal('literal'), literal }),
]);
export type ValueRef = z.infer<typeof valueRef>;

/** A named secret. Never compared, never read into, never published. */
export const secretRef = object({ from: z.literal('secret'), credential: name });

/** What an `enter` step may put into a field — the one place a secret is allowed. */
export const enterValue = z.union([valueRef, secretRef]);
export type EnterValue = z.infer<typeof enterValue>;

const sides = { left: valueRef, right: valueRef };

/** A comparison carries its type, so the operator set is fixed by construction. */
export const comparison = z.discriminatedUnion('of', [
  object({ of: z.literal('text'), operator: textOperator, ...sides }),
  object({ of: z.literal('number'), operator: numberOperator, ...sides }),
  object({ of: z.literal('date'), operator: dateOperator, ...sides }),
  object({ of: z.literal('yesNo'), operator: yesNoOperator, ...sides }),
  object({ of: z.literal('listOfRows'), operator: listOperator, left: valueRef, count: z.number().int().nonnegative().optional() }),
  object({ of: z.literal('absence'), operator: absenceOperator, left: valueRef }),
]);
export type Comparison = z.infer<typeof comparison>;

/** Constraints an author may put on a declared value. Decision 14 item 2. */
export const constraints = object({
  pattern: z.string().max(256).optional(),
  allowedValues: z.array(z.string()).max(64).optional(),
  maxLength: z.number().int().positive().optional(),
  minimum: z.number().optional(),
  maximum: z.number().optional(),
  earliest: z.iso.date().optional(),
  latest: z.iso.date().optional(),
});

/** A value the workflow declares: an input, or something a step produces. */
export const declaredValue = object({
  name,
  label: z.string().min(1).max(120),
  type: valueType,
  required: z.boolean(),
  constraints: constraints.optional(),
});
export type DeclaredValue = z.infer<typeof declaredValue>;
