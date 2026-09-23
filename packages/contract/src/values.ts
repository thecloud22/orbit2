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
/**
 * What a credential is called in the registry.
 *
 * Not `name`. A registered credential is `UNDERWRITING_PW` — an environment
 * variable by convention and by how operations teams already name these —
 * which the camelCase identifier `name` cannot express. So a secret reference
 * could not name any credential that actually exists, and the recorder wrote
 * `portalPassword` into every one: a reference that parsed and pointed at
 * nothing.
 */
export const credentialName = z
  .string()
  .min(1)
  .max(120)
  .regex(/^[A-Za-z][A-Za-z0-9_-]*$/, 'letters, digits, underscores and hyphens');

export const secretRef = object({ from: z.literal('secret'), credential: credentialName });

/**
 * The account the registry says this application signs in as.
 *
 * It carries no name because there is nothing to name: the value is on the
 * application's revision, beside the credential the password is filed under,
 * and a version copies both. The pair is the sign-in.
 *
 * It exists because the alternative was making the account a declared input.
 * A recorded sign-in typed a user id into a box, so the recorder declared
 * `userId` as something supplied at the start of every run — which asked the
 * person starting it to type the service account's name, put that name in
 * `run.inputs` and in the workflow's example, and let whoever started a run
 * choose which account the agent signed in as. None of those is what a
 * registered account means.
 */
export const accountRef = object({ from: z.literal('account') });

/**
 * What an `enter` step may put into a field — the one place a secret or the
 * registered account is allowed. Both are the sign-in, and neither is a value
 * a run may be started with, compared against or made to publish.
 */
/**
 * A value an earlier step read, typed where another system spells it
 * differently (Orbit 2.2, C13): the web portal's *Conventional* is the green
 * screen's `CONV`. The table is the agent's, asked once and kept; a value
 * with no entry halts the run rather than being typed as it came.
 */
export const codedStepRef = object({
  from: z.literal('step'),
  value: name,
  codes: z.record(z.string().min(1).max(120), z.string().min(1).max(120)),
});

export const enterValue = z.union([valueRef, codedStepRef, secretRef, accountRef]);
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

/**
 * Which object a value is a field of (procedure editor R26, Decision 14 as
 * amended): a loan's `ltv`, a borrower's `creditScore`. The DataStore holds
 * objects, and a run hands its outputs back as objects.
 *
 * A grouping, not a path: a step still names a value by its own unique name,
 * and there is still nowhere to type `loan.ltv` (Decision 14 item 3). The
 * object and field are what a person and a caller of the run see.
 */
export const fieldOf = object({ object: name, field: name });
export type FieldOf = z.infer<typeof fieldOf>;

/** A value the workflow declares: an input, or something a step produces. */
export const declaredValue = object({
  name,
  label: z.string().min(1).max(120),
  type: valueType,
  required: z.boolean(),
  constraints: constraints.optional(),
  of: fieldOf.optional(),
});
export type DeclaredValue = z.infer<typeof declaredValue>;

/**
 * Values shaped as the objects they belong to: `{ loan: { number, ltv } }`.
 * A value that belongs to no object keeps its own name at the top level, and
 * nothing is dropped or merged: two values claiming one field of one object
 * cannot both be shown, so the second keeps its own name instead.
 */
export function asObjects(values: Record<string, unknown>,
  declared: ReadonlyArray<{ name: string; of?: FieldOf | undefined }>): Record<string, unknown> {
  const ofByName = new Map(declared.filter((d) => d.of).map((d) => [d.name, d.of!]));
  const out: Record<string, unknown> = {};
  for (const [name, value] of Object.entries(values)) {
    const of = ofByName.get(name);
    const holder = of ? out[of.object] : undefined;
    if (of && (holder === undefined || (typeof holder === 'object' && holder !== null && !Array.isArray(holder)))) {
      const fields = (holder ?? {}) as Record<string, unknown>;
      if (!(of.field in fields)) { fields[of.field] = value; out[of.object] = fields; continue; }
    }
    out[name] = value;
  }
  return out;
}

/** A run's outputs, objects and all, as `loan.ltv`-style names and their values, for showing or checking. */
export function fieldsOf(outputs: Record<string, unknown>): Array<[string, unknown]> {
  return Object.entries(outputs).flatMap(([k, v]) => (v && typeof v === 'object' && !Array.isArray(v)
    ? Object.entries(v as Record<string, unknown>).map(([f, x]): [string, unknown] => [`${k}.${f}`, x])
    : [[k, v] as [string, unknown]]));
}
