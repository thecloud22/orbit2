/**
 * Finding the control a step names, on a real page.
 *
 * Two rules, and the second is the one that matters.
 *
 * **Exactly one, or refuse.** Zero matches is a refusal. Two matches is *also*
 * a refusal (Decision 12) — a name that fits two controls identifies neither,
 * and picking the first would be Orbit guessing on the operator's behalf.
 *
 * **`data-testid` is never read.** These portals carry them for their own
 * Playwright suites. A test id changes without warning, and the applications a
 * customer actually runs do not have them — so binding to one would make the
 * binder look solved while leaving every strategy below it untested.
 */
import type { Frame, Locator, Page } from 'playwright';

export type Strategy = 'roleAndName' | 'label' | 'formName' | 'text' | 'structural';

export interface Binding {
  strategy: Strategy;
  role?: string;
  name?: string;
  /** What must still be true about whatever was found. A mismatch halts. */
  corroborate?: { text?: string };
}

export type Resolution =
  | { found: 'one'; locator: Locator; by: Strategy }
  | { found: 'none'; tried: Strategy[] }
  | { found: 'many'; count: number; by: Strategy };

function candidate(page: Page | Frame, binding: Binding): Locator | null {
  switch (binding.strategy) {
    case 'roleAndName':
      if (!binding.role || !binding.name) return null;
      return page.getByRole(binding.role as Parameters<Page['getByRole']>[0], {
        name: binding.name, exact: true,
      });
    case 'label':
      return binding.name ? page.getByLabel(binding.name, { exact: true }) : null;
    case 'formName':
      return binding.name ? page.locator(`[name="${binding.name}"]`) : null;
    case 'text':
      return binding.name ? page.getByText(binding.name, { exact: true }) : null;
    case 'structural':
      // The rung an old page usually leaves you: a value in a cell or a div
      // with no attribute of any kind, named only by the label beside it.
      // `:text-is` matches the smallest element holding exactly that text, so
      // the label's own node is found rather than every ancestor of it.
      return binding.name
        ? page.locator(`:text-is("${binding.name}")`).locator('xpath=following-sibling::*[1]')
        : null;
  }
}

/**
 * Resolves, and says honestly which of three things happened. The caller
 * cannot accidentally treat "two matched" as success, because it is not a
 * locator — it is a different shape.
 */
export async function resolve(page: Page | Frame, binding: Binding): Promise<Resolution> {
  const locator = candidate(page, binding);
  if (!locator) return { found: 'none', tried: [binding.strategy] };
  const count = await locator.count();
  if (count === 0) return { found: 'none', tried: [binding.strategy] };
  if (count > 1) return { found: 'many', count, by: binding.strategy };

  if (binding.corroborate?.text) {
    const text = (await locator.innerText().catch(() => '')) || '';
    if (!text.includes(binding.corroborate.text)) {
      // It resolved, and it is not the thing that was approved. A fallback
      // would try something else here; corroboration stops, which is the
      // difference between a halted run and a wrong one.
      return { found: 'none', tried: [binding.strategy] };
    }
  }
  return { found: 'one', locator, by: binding.strategy };
}

export function describeRefusal(label: string, resolution: Resolution): string {
  return resolution.found === 'many'
    ? `"${label}" matched ${resolution.count} things on the page. A name that fits more than one identifies neither.`
    : `"${label}" matched nothing on the page.`;
}
