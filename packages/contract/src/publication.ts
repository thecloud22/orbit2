/**
 * Why a workflow will not publish.
 *
 * §4: "Orbit refuses to publish a workflow it cannot resolve completely: an
 * incomplete step, a value no step in the workflow produces, a path that
 * reaches no declared ending, or an instruction it does not fully understand
 * each block publication, and the refusal names the specific blocker rather
 * than reporting a general failure."
 *
 * "Names the specific blocker" is why these are a closed set with fields
 * rather than a string. A refusal a person can act on says which step, which
 * value, which name matched twice — and a message that has to be parsed to
 * find that out is a general failure wearing a specific coat.
 */
import { object, name, z } from './zod.ts';

export const blocker = z.discriminatedUnion('kind', [
  /** A step exists but has not been configured. §6: an inserted step is
   *  incomplete until configured, and blocks publication until it is. */
  object({ kind: z.literal('stepIncomplete'), step: z.number().int().positive(),
           missing: z.array(z.string()).min(1) }),

  /** The refusal §4 names first. A step uses a value that nothing produces on
   *  every path reaching it (Decision 14 item 3). */
  object({ kind: z.literal('valueNotProduced'), step: z.number().int().positive(),
           value: name,
           /** Named separately because "produced, but not on every path" is a
            *  different fix from "produced nowhere at all". */
           producedSomewhere: z.boolean() }),

  /** A path that runs out without reaching an ending. */
  object({ kind: z.literal('pathReachesNoEnding'), step: z.number().int().positive(),
           fromBranch: z.number().int().positive().optional() }),

  /** An ending naming an outcome the version does not declare. A run cannot
   *  invent a conclusion, so neither can a step. */
  object({ kind: z.literal('outcomeNotDeclared'), step: z.number().int().positive(), outcome: name }),

  /** A declared outcome no path can reach. The list on the publish panel is
   *  what run results are reported against; an unreachable one is a lie. */
  object({ kind: z.literal('outcomeUnreachable'), outcome: name }),

  /** Decision 12: two things matched one name, so the name identifies neither.
   *  Found by opening the application, which is why this one needs a browser. */
  object({ kind: z.literal('nameMatchedMoreThanOne'), step: z.number().int().positive(),
           label: z.string(), matched: z.number().int().min(2) }),

  /** Nothing matched, on the page the step says it is on. */
  object({ kind: z.literal('nameMatchedNothing'), step: z.number().int().positive(), label: z.string() }),

  /** Decision 15: `text` and `structural` can return the wrong element, so
   *  they are refused without something that must also be true. */
  object({ kind: z.literal('bindingNeedsCorroboration'), step: z.number().int().positive(),
           label: z.string(), strategy: z.string() }),

  /** The version would reach somewhere its applications do not permit. */
  object({ kind: z.literal('addressNotPermitted'), step: z.number().int().positive(), address: z.string() }),

  /** An ending with no example value, so no test could prove it (§4). */
  object({ kind: z.literal('endingHasNoExample'), outcome: name }),

  /** §4 and acceptance criterion 3: an outstanding question, assumption,
   *  exception or unacknowledged risk. */
  object({ kind: z.literal('outstanding'), step: z.number().int().positive().optional(),
           note: z.enum(['question', 'assumption', 'exception', 'risk']), body: z.string() }),
]);
export type Blocker = z.infer<typeof blocker>;

export const publication = z.discriminatedUnion('outcome', [
  object({ outcome: z.literal('published'), version: z.number().int().positive(), digest: z.string() }),
  /** Every blocker, not the first one. A person fixing three things wants to
   *  know there are three. */
  object({ outcome: z.literal('refused'), blockers: z.array(blocker).min(1) }),
]);
export type Publication = z.infer<typeof publication>;

/** Said in the author's terms. The interface shows this, not the discriminant. */
export function describeBlocker(b: Blocker): string {
  switch (b.kind) {
    case 'stepIncomplete':
      return `Step ${b.step} is not finished: ${b.missing.join(', ')}.`;
    case 'valueNotProduced':
      return b.producedSomewhere
        ? `Step ${b.step} uses "${b.value}", which is not produced on every path that reaches it.`
        : `Step ${b.step} uses "${b.value}", which no step produces.`;
    case 'pathReachesNoEnding':
      return `The path from step ${b.fromBranch ?? b.step} runs out without reaching a conclusion.`;
    case 'outcomeNotDeclared':
      return `Step ${b.step} ends with "${b.outcome}", which this workflow does not declare.`;
    case 'outcomeUnreachable':
      return `Nothing can reach the conclusion "${b.outcome}", so it should not be declared.`;
    case 'nameMatchedMoreThanOne':
      return `"${b.label}" at step ${b.step} matched ${b.matched} things on the page. A name that fits more than one identifies neither.`;
    case 'nameMatchedNothing':
      return `"${b.label}" at step ${b.step} matched nothing on the page.`;
    case 'bindingNeedsCorroboration':
      return `"${b.label}" at step ${b.step} is found in a way that can return the wrong thing, so it needs something that must also be true.`;
    case 'addressNotPermitted':
      return `Step ${b.step} would reach ${b.address}, which this workflow is not registered to reach.`;
    case 'endingHasNoExample':
      return `"${b.outcome}" has no example value, so no test could prove it.`;
    case 'outstanding':
      return b.step
        ? `An unresolved ${b.note} on step ${b.step}: ${b.body}`
        : `An unresolved ${b.note}: ${b.body}`;
  }
}
