/**
 * Finding the control a step names, on a real page.
 *
 * The ladder below is not reasoned from first principles. It was measured
 * against `demo/legacy-portal`: 181 workflow-relevant elements across 17 page
 * states, every strategy tried with every name an author could plausibly
 * supply. What that measurement changed is worth stating, because it
 * contradicted the design it replaced.
 *
 * **`count() === 1` is necessary and not sufficient.** A strategy can return
 * exactly one element and have it be the wrong element. `structural` did that
 * 28 times out of 181 — `following-sibling::*[1]` always returns *something*,
 * so on a two-column form it confidently hands back the `<td>` wrapping the
 * input. A confident wrong element is worse than a refusal, and refusing was
 * the whole point of Decision 12.
 *
 * So the rungs are ordered by **how often they are wrong**, not by how much
 * they reach — and the two that can be wrong may not be used at all without
 * corroboration.
 *
 * Measured, of 181:
 *   roleAndName  73 unique,  0 wrong   ← never wrong anywhere in the portal
 *   label         0 unique,  0 wrong   ← nothing here; essential on modern pages
 *   formName      7 unique,  0 wrong
 *   controlBeside 11 unique, 0 wrong   ← added because of this measurement
 *   rowAndColumn 52 unique,  0 wrong   ← added; the only rung with no failure mode
 *   text        128 unique, 10 wrong   ← widest reach, and it can lie
 *   structural   54 unique, 28 wrong   ← last resort, and only with corroboration
 *
 * `data-testid` is never read. These portals carry them for their own test
 * suites; a test id changes without warning and is absent from the
 * applications a customer runs.
 */
import type { Frame, Locator, Page } from 'playwright';

export type Strategy =
  | 'roleAndName' | 'label' | 'formName'
  | 'controlBeside' | 'rowAndColumn' | 'text' | 'structural';

/** In the order they are tried. Safety first, reach second. */
export const LADDER: readonly Strategy[] = [
  'roleAndName', 'label', 'formName', 'controlBeside', 'rowAndColumn', 'text', 'structural',
];

/**
 * Rungs that can return exactly one element and have it be the wrong one.
 * They are refused outright unless the binding says what must also be true,
 * because an uncorroborated guess from one of these is how a reference number
 * ends up typed into a username field.
 */
const CAN_BE_CONFIDENTLY_WRONG: ReadonlySet<Strategy> = new Set(['text', 'structural']);

export interface Binding {
  strategy: Strategy;
  role?: string;
  /** The label, the heading, the form name — whatever this rung matches on. */
  name?: string;
  /** `rowAndColumn` only: which row, and which column heading. */
  row?: string;
  column?: string;
  /** Narrows the search to the region containing this text, or to a frame. */
  within?: { text?: string; frame?: string };
  /** What must still be true of whatever was found. A mismatch halts. */
  corroborate?: { text?: string; tag?: string };
}

export type Resolution =
  | { found: 'one'; locator: Locator; by: Strategy }
  | { found: 'none'; by: Strategy; why?: string }
  | { found: 'many'; count: number; by: Strategy };

const CONTROLS = 'input, select, textarea, button, a';

/**
 * A string, safely, inside an XPath expression.
 *
 * XPath has no escape character, so a name carrying a quote cannot be written
 * as a literal at all — it has to be assembled with concat(). These names come
 * off the page, and a column headed `Borrower"s agent` or a cell containing an
 * apostrophe produced an expression that was either malformed or, worse, still
 * valid and matching something else.
 */
function xpathLiteral(value: string): string {
  if (!value.includes('"')) return `"${value}"`;
  if (!value.includes("'")) return `'${value}'`;
  return `concat(${value.split('"').map((part) => `"${part}"`).join(', \'"\', ')})`;
}

function scope(page: Page | Frame, binding: Binding): Page | Frame | Locator {
  if (binding.within?.frame) {
    const frame = (page as Page).frame?.({ name: binding.within.frame });
    if (frame) return frame;
  }
  if (binding.within?.text) {
    // The smallest region whose own text names it — enough to say *which* of
    // two identical tables on one page is meant.
    return page.locator(`xpath=//*[*[normalize-space()="${binding.within.text}"]]`).first();
  }
  return page;
}

function candidate(root: Page | Frame | Locator, b: Binding): Locator | null {
  switch (b.strategy) {
    case 'roleAndName':
      return b.role && b.name
        ? root.getByRole(b.role as Parameters<Page['getByRole']>[0], { name: b.name, exact: true })
        : null;
    case 'label':
      return b.name ? root.getByLabel(b.name, { exact: true }) : null;
    case 'formName':
      return b.name ? root.locator(`[name="${b.name}"]`) : null;
    case 'controlBeside': {
      // The rung an old two-column form leaves you on, and the fix for
      // `structural`'s wrong binds: the sibling must actually BE a control,
      // so the wrapping cell can no longer be returned in its place.
      //
      // Two things this has to say that the obvious expression does not.
      //
      // The label must be the innermost element carrying that text. A form
      // laid out in a table puts the label in a cell and the field in the
      // next one, and a field contributes no text — so the whole ROW also
      // normalises to just the label, and the row's next sibling is the next
      // row. Every label on every table form matched twice, and the second
      // match was the field belonging to the line below. Ambiguous, so
      // Decision 12 refused it, so a page laid out the way these all are
      // could not be signed in to at all.
      //
      // And then it is not the innermost element that has the sibling: in
      // `<td><b>User</b></td>` the bold tag is innermost and has no sibling,
      // while its cell does. So it climbs to the nearest ancestor-or-self
      // that has one, which is that cell.
      if (!b.name) return null;
      const label = xpathLiteral(b.name);
      return root.locator(
        `xpath=//*[normalize-space()=${label} and not(.//*[normalize-space()=${label}])]`
        + `/ancestor-or-self::*[following-sibling::*][1]/following-sibling::*[1]`,
      ).locator(CONTROLS);
    }
    case 'rowAndColumn':
      // A grid cell named the way a person names one. Measured 52 unique,
      // nothing ambiguous and nothing wrong — the only rung with no failure
      // mode at all, which is why it sits above every rung that can lie.
      return b.row && b.column
        ? root.locator(
            `xpath=//tr[td[normalize-space()=${xpathLiteral(b.row)}]]/td[` +
            `position() = count((ancestor::table[1]//tr)[1]/*[normalize-space()=${xpathLiteral(b.column)}]` +
            `/preceding-sibling::*) + 1]`)
        : null;
    case 'text':
      return b.name ? root.getByText(b.name, { exact: true }) : null;
    case 'structural':
      return b.name
        ? root.locator(`:text-is("${b.name}")`).locator('xpath=following-sibling::*[1]')
        : null;
  }
}

export async function resolve(page: Page | Frame, binding: Binding): Promise<Resolution> {
  const by = binding.strategy;

  if (CAN_BE_CONFIDENTLY_WRONG.has(by) && !binding.corroborate) {
    // Measured: these two return one confidently-wrong element often enough
    // that an uncorroborated match from them is not evidence of anything.
    return { found: 'none', by, why: 'this way of naming it can find the wrong thing, so it needs something that must also be true' };
  }

  const locator = candidate(scope(page, binding), binding);
  if (!locator) return { found: 'none', by, why: 'the binding does not carry what this rung needs' };

  const count = await locator.count();
  if (count === 0) return { found: 'none', by };
  if (count > 1) return { found: 'many', count, by };

  if (binding.corroborate?.tag) {
    const tag = (await locator.evaluate((el) => el.tagName.toLowerCase()).catch(() => '')) || '';
    if (tag !== binding.corroborate.tag) return { found: 'none', by, why: `found a <${tag}>, expected a <${binding.corroborate.tag}>` };
  }
  if (binding.corroborate?.text) {
    const text = (await locator.innerText().catch(() => '')) || '';
    if (!text.includes(binding.corroborate.text)) {
      // It resolved, and what it found is not what was approved. A fallback
      // would try the next rung here; corroboration stops. That is the
      // difference between a halted run and a wrong one.
      return { found: 'none', by, why: 'what it found is not what was approved' };
    }
  }
  return { found: 'one', locator, by };
}

export function describeRefusal(label: string, r: Resolution): string {
  if (r.found === 'many') {
    return `"${label}" matched ${r.count} things on the page. A name that fits more than one identifies neither.`;
  }
  if (r.found === 'none') {
    return r.why
      ? `"${label}" could not be identified: ${r.why}.`
      : `"${label}" matched nothing on the page.`;
  }
  return `"${label}" resolved.`;
}
