/**
 * The half of publication that needs the application open.
 *
 * `checkForPublication` in the API reads the step graph and can say a value is
 * never produced or a path reaches no ending. It cannot say whether "Amount
 * outstanding" is one thing on the page or two. That needs the page.
 *
 * And it needs the page *in the state the step will meet it*. You cannot check
 * a control on the fourth screen without getting to the fourth screen, so this
 * walks the workflow for real — navigating, entering, activating — and checks
 * each binding at the moment the step would use it.
 *
 * One pass walks one path. A workflow with three endings has bindings that
 * only exist on one of them, so the pass is run once per declared ending, with
 * the example value the author supplied for it — which is what §4 says those
 * examples are for: "the example values were supplied when the process was
 * confirmed, so the tests exercise the endings the process owner themselves
 * said the procedure can reach".
 *
 * Which is why this reports differently from the static checks. Those collect
 * every blocker, because they are independent. These are sequential: a step
 * that cannot be resolved is a step the walk cannot get past, so it stops and
 * says how far it got. Claiming to have checked screens it never reached would
 * be the more useful-looking lie.
 */
import type { Blocker, Step } from '@orbit/contract';
import { chromium } from 'playwright';
import { type Binding, resolve as resolveBinding } from './binder.ts';

export interface ResolutionReport {
  checked: number;
  of: number;
  blockers: Blocker[];
  /** What it could not get past, if anything. */
  stoppedAt: number | null;
}

export interface PassReport extends ResolutionReport { ending: string }

/**
 * Once per declared ending. A binding that only appears on one path is only
 * checked by the pass that takes that path, and a name that resolves on one
 * page may be ambiguous on another — so all of them run even if an early one
 * refuses, and every refusal is reported together.
 */
export async function resolveEveryEnding(
  steps: Step[], origin: string,
  examples: Array<{ ending: string; inputs: Record<string, string> }>,
): Promise<PassReport[]> {
  const reports: PassReport[] = [];
  for (const { ending, inputs } of examples) {
    reports.push({ ending, ...(await resolveForPublication(steps, origin, inputs)) });
  }
  return reports;
}

const targetOf = (step: Step) =>
  step.kind === 'enter' ? step.into
  : step.kind === 'activate' ? step.control
  : step.kind === 'read' ? step.region
  : step.kind === 'collect' ? step.table
  : null;

export async function resolveForPublication(
  steps: Step[], origin: string, inputs: Record<string, string>,
): Promise<ResolutionReport> {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const blockers: Blocker[] = [];
  const bindable = steps.filter((s) => targetOf(s) !== null).length;
  let checked = 0;

  // Follow the graph, not the array. A step on the found branch is not on the
  // missing branch, and checking it there would refuse a workflow for a name
  // that was never going to be looked for.
  const positionOf = new Map(steps.map((step, i) => [step.id, i + 1]));
  const values = new Map<string, string | null>();

  try {
    let position = 1;
    const seen = new Set<number>();
    while (position >= 1 && position <= steps.length && !seen.has(position)) {
      seen.add(position);
      const step = steps[position - 1]!;

      if (step.kind === 'open') {
        await page.goto(`${origin}${step.path}`, { waitUntil: 'domcontentloaded' });
        position += 1; continue;
      }

      if (step.kind === 'branch') {
        const left = step.when.left.from === 'step' ? values.get(step.when.left.value) ?? null : null;
        const took = step.when.of === 'absence'
          ? (step.when.operator === 'isAbsent' ? left === null : left !== null)
          : left !== null;
        position = positionOf.get(took ? step.ifTrue : step.ifFalse) ?? steps.length + 1;
        continue;
      }

      if (step.kind === 'end') break;

      const target = targetOf(step);
      if (!target) { position += 1; continue; }

      const binding = target.binding as Binding | null;
      if (!binding?.strategy) {
        blockers.push({ kind: 'stepIncomplete', step: position,
          missing: [`how to find "${target.label}"`] });
        return { checked, of: bindable, blockers, stoppedAt: position };
      }

      // Named before the page is consulted, because the reason is about the
      // binding rather than about what is on screen. "Matched nothing" would
      // send the author to stare at a page where the real fix is here.
      if ((binding.strategy === 'text' || binding.strategy === 'structural') && !binding.corroborate) {
        blockers.push({ kind: 'bindingNeedsCorroboration', step: position,
          label: target.label, strategy: binding.strategy });
        return { checked, of: bindable, blockers, stoppedAt: position };
      }

      const found = await resolveBinding(page, binding);
      checked += 1;

      if (found.found === 'many') {
        // The refusal Decision 12 exists for. The count is what tells the
        // author the name is not doing its job.
        blockers.push({ kind: 'nameMatchedMoreThanOne', step: position,
          label: target.label, matched: found.count });
        return { checked, of: bindable, blockers, stoppedAt: position };
      }

      if (found.found === 'none') {
        // A read the author declared as not required is *expected* to find
        // nothing on the paths where the thing is not there. That absence is
        // how "no such record" is expressed at all, so treating it as a
        // blocker would make acceptance criterion 7 unpublishable.
        if (step.kind === 'read' && !step.produces.required) {
          values.set(step.produces.name, null);
          position += 1; continue;
        }
        blockers.push({ kind: 'nameMatchedNothing', step: position, label: target.label });
        return { checked, of: bindable, blockers, stoppedAt: position };
      }

      // It resolves. Now do the step, because the next one expects the page to
      // have moved. A pass that never acts can only check the first screen.
      if (step.kind === 'enter') {
        const ref = step.value;
        const value = ref.from === 'input' ? inputs[ref.value] ?? ''
          : ref.from === 'literal' && ref.literal.type === 'text' ? ref.literal.text : '';
        await found.locator.fill(value);
      } else if (step.kind === 'activate') {
        await found.locator.click();
        await page.waitForLoadState('domcontentloaded');
      } else if (step.kind === 'read') {
        values.set(step.produces.name, (await found.locator.innerText()).trim());
      }
      position += 1;
    }
    return { checked, of: bindable, blockers, stoppedAt: null };
  } finally {
    await page.close();
    await browser.close();
  }
}
