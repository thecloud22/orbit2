/**
 * The gate.
 *
 * §4: "Publication is the gate. Orbit refuses to publish a workflow it cannot
 * resolve completely… and the refusal names the specific blocker rather than
 * reporting a general failure."
 *
 * Everything here is a static check over the step graph. The remaining
 * checks — does this name resolve to exactly one thing on the page — need the
 * application open, which is the worker's job because the worker owns the
 * browser. A workflow that passes these has not been published; it has been
 * cleared to be resolved.
 *
 * Every blocker is collected, never just the first. Somebody fixing three
 * things wants to know there are three.
 */
import type { Blocker, Step } from '@orbit/contract';

const CAN_LIE = new Set(['text', 'structural']);

/**
 * A step in a draft is allowed to be half-written.
 *
 * §6: an inserted step is incomplete until it is configured, and blocks
 * publication until it is. That means the checker has to *carry* an unparsable
 * step rather than choke on one — an editor that cannot read a draft
 * containing the step you just inserted is an editor that cannot insert a
 * step.
 *
 * An incomplete step is structurally inert: it produces nothing, uses nothing,
 * and passes control to the next step. It contributes exactly one blocker,
 * which is that it is not finished.
 */
export type DraftStep = Step | { id: string; kind: string; incomplete: true; missing: string[] };

const unfinished = (s: DraftStep): s is Extract<DraftStep, { incomplete: true }> => 'incomplete' in s;

/** Where a step can go next, given the graph rather than the order. */
function successors(step: DraftStep, index: number, byId: Map<string, number>): number[] {
  if (unfinished(step)) return index + 1 < byId.size ? [index + 1] : [];
  if (step.kind === 'end') return [];
  if (step.kind === 'branch') {
    return [byId.get(step.ifTrue), byId.get(step.ifFalse)]
      .filter((n): n is number => n !== undefined);
  }
  return index + 1 < byId.size ? [index + 1] : [];
}

/** What a step produces, if anything. */
function produces(step: DraftStep): string[] {
  if (unfinished(step)) return [];
  if (step.kind === 'read') return [step.produces.name];
  if (step.kind === 'collect') return [step.into];
  if (step.kind === 'handOff') return step.handsBack.map((v) => v.name);
  return [];
}

/** Every value a step names. A secret is not among them: it is a different
 *  reference kind and is not resolvable from the value table (Decision 14). */
type Comparison = Extract<Step, { kind: 'branch' }>['when'];

const from = (r: { from: string; value?: string }) => (r.from === 'step' ? [r.value!] : []);

function comparisonUses(c: Comparison): string[] {
  return 'right' in c ? [...from(c.left), ...from(c.right)] : from(c.left);
}

function uses(step: DraftStep): string[] {
  if (unfinished(step)) return [];
  switch (step.kind) {
    case 'enter': return step.value.from === 'step' ? [step.value.value] : [];
    // `check` and `branch` each carry a comparison under their own name, and
    // the union keeps them apart on purpose — a step that checks and a step
    // that chooses are different acts with different evidence.
    case 'check': return comparisonUses(step.that);
    case 'branch': return comparisonUses(step.when);
    case 'forEach': return from(step.list);
    case 'handOff': return step.show.flatMap(from);
    case 'end': return step.publishes;
    default: return [];
  }
}

export function checkForPublication(
  steps: DraftStep[],
  declared: { inputs: string[]; outcomes: string[]; examples: Record<string, unknown> },
): Blocker[] {
  const blockers: Blocker[] = [];
  const byId = new Map(steps.map((s, i) => [s.id, i]));
  const at = (i: number) => i + 1;

  // ── a value must be produced on EVERY path that reaches the step ─────────
  // Walked forwards from the entry, carrying the set of values definitely
  // produced so far, and intersected wherever paths meet. That intersection
  // is the whole difference between "produced somewhere" and "produced on
  // every path", which are different problems with different fixes.
  const definite = new Map<number, Set<string>>();
  const everProduced = new Set(steps.flatMap(produces));
  const queue: Array<[number, Set<string>]> = [[0, new Set(declared.inputs)]];
  const reachable = new Set<number>();

  while (queue.length) {
    const [index, incoming] = queue.shift()!;
    const step = steps[index];
    if (!step) continue;
    reachable.add(index);

    const known = definite.get(index);
    const merged = known ? new Set([...known].filter((v) => incoming.has(v))) : new Set(incoming);
    if (known && merged.size === known.size) continue;   // nothing narrowed; stop
    definite.set(index, merged);

    for (const value of uses(step)) {
      if (!merged.has(value)) {
        blockers.push({ kind: 'valueNotProduced', step: at(index), value,
          producedSomewhere: everProduced.has(value) });
      }
    }

    const onward = new Set([...merged, ...produces(step)]);
    for (const next of successors(step, index, byId)) queue.push([next, onward]);
  }

  for (const [index, step] of steps.entries()) {
    // Reported alongside whatever else is wrong with the step, not instead of
    // it — a person fixing three things wants to know there are three.
    if (!reachable.has(index)) blockers.push({ kind: 'stepUnreachable', step: at(index) });

    if (unfinished(step)) {
      blockers.push({ kind: 'stepIncomplete', step: at(index), missing: step.missing });
      continue;
    }

    // ── a path that runs out ───────────────────────────────────────────────
    if (step.kind !== 'end' && step.kind !== 'handOff'
        && successors(step, index, byId).length === 0 && reachable.has(index)) {
      blockers.push({ kind: 'pathReachesNoEnding', step: at(index) });
    }

    // ── a conclusion nothing declared ──────────────────────────────────────
    if (step.kind === 'end' && !declared.outcomes.includes(step.outcome)) {
      blockers.push({ kind: 'outcomeNotDeclared', step: at(index), outcome: step.outcome });
    }

    // ── a read that finds the value by the value ───────────────────────────
    // Only `read` is affected. An `activate` bound by the text on a button is
    // naming the control; a `read` bound by the text in a region is naming the
    // answer.
    if (step.kind === 'read') {
      const b = step.region.binding as { strategy?: string; role?: string; name?: string } | null;
      const byOwnText = b?.strategy === 'text'
        || (b?.strategy === 'roleAndName' && b.role === 'text');
      if (byOwnText && b?.name) {
        blockers.push({ kind: 'readIsCircular', step: at(index),
          value: step.produces.name, looksFor: b.name });
      }
    }

    // ── a way of naming a control that can return the wrong one ────────────
    const target = step.kind === 'enter' ? step.into
      : step.kind === 'activate' ? step.control
      : step.kind === 'read' ? step.region
      : step.kind === 'collect' ? step.table : null;
    if (target) {
      const binding = target.binding as { strategy?: string; corroborate?: unknown } | null;
      if (!binding?.strategy) {
        blockers.push({ kind: 'stepIncomplete', step: at(index), missing: ['how to find "' + target.label + '"'] });
      } else if (CAN_LIE.has(binding.strategy) && !binding.corroborate) {
        blockers.push({ kind: 'bindingNeedsCorroboration', step: at(index),
          label: target.label, strategy: binding.strategy });
      }
    }
  }

  // ── a declared conclusion nothing can reach ──────────────────────────────
  const reached = new Set(steps.filter((s, i) => !unfinished(s) && s.kind === 'end' && reachable.has(i))
    .map((s) => (s as Extract<Step, { kind: 'end' }>).outcome));
  for (const outcome of declared.outcomes) {
    if (!reached.has(outcome)) blockers.push({ kind: 'outcomeUnreachable', outcome });
    else if (!(outcome in declared.examples)) blockers.push({ kind: 'endingHasNoExample', outcome });
  }

  return blockers;
}
