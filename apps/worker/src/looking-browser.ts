/**
 * The browser, as the walk sees it while an agent is built (Orbit 2.2, C1–C2).
 *
 * Moved here from `author.ts` without changing what it does: the same launch,
 * the same snapshot, the same way of filling a field and of pressing, the same
 * settling. The walk now asks for these by what they are for, and a green
 * screen answers the same questions in `looking-tn3270.ts`.
 */
import type { Step } from '@orbit/contract';
import { chromium, type Locator, type Page } from 'playwright';
import { describeRefusal, resolve as resolveBinding } from './binder.ts';
import { toType, type Box, type Looking, type OpenLooking, type Typing } from './looking.ts';
import { snapshot, type Seen } from './snapshot.ts';

/**
 * Wait for the navigation a click causes, not for the document it is leaving.
 *
 * `waitForLoadState('domcontentloaded')` asks about the *current* document,
 * which has already loaded — so it returned at once, before the click's
 * navigation had begun, and the next turn mapped against the page the walk had
 * just left. On the portal's login page, whose submit handler assigns
 * `window.location.href`, that meant a turn read the brand block off `/login`
 * and called it "the pipeline has loaded": kept as a step, no question raised,
 * and a draft declaring a conclusion it had never reached.
 *
 * The ceiling is what tells a click that navigates apart from one that only
 * redraws. Nothing distinguishes them in advance, and waiting on an address
 * that will never change has to end somewhere. Two seconds is long enough for
 * a local application and short enough that a dozen turns do not stall on it.
 */
export async function settleAfterActivating(page: Page, wasAt: string): Promise<void> {
  await page.waitForURL((u) => u.toString() !== wasAt, { timeout: 2000 }).catch(() => undefined);
  await page.waitForLoadState('domcontentloaded').catch(() => undefined);
}

class BrowserLooking implements Looking {
  #close: () => Promise<void>;
  #page: Page;
  #origin: string;
  /**
   * What has been typed since the last press, so a press never goes ahead on
   * a form that has lost it. A run types and presses back to back; the walk
   * waits on a model between them, and a page left for minutes can reload.
   * Scenario 6: the loan number was in the box on one turn and gone on the
   * next, so "Open file" said no file matches and the walk never opened the
   * loan; scenario 8's sign-in did nothing the same way.
   */
  #typed: Array<{ field: Locator; value: string }> = [];

  constructor(page: Page, origin: string, close: () => Promise<void>) {
    this.#page = page;
    this.#origin = origin;
    this.#close = close;
  }

  place(): string { return this.#page.url(); }

  async open(path: string): Promise<void> {
    await this.#page.goto(`${this.#origin}${path}`, { waitUntil: 'domcontentloaded' });
  }

  look(): Promise<Seen[]> { return snapshot(this.#page); }

  async visibleText(): Promise<string> {
    return String(await this.#page.evaluate('document.body ? document.body.innerText : ""').catch(() => ''));
  }

  async picture(): Promise<{ bytes: Buffer; mediaType: string } | null> {
    return this.#page.screenshot({ type: 'png' }).then((bytes) => ({ bytes, mediaType: 'image/png' }));
  }

  /** Where an element is on the page's picture, as fractions of it (see `Box`). */
  async boxOf(element: Seen): Promise<Box | undefined> {
    const page = this.#page;
    const viewport = page.viewportSize();
    if (!viewport) return undefined;
    const found = await resolveBinding(page, element.binding).catch(() => null);
    const locator = found?.found === 'one' ? found.locator
      : page.getByRole(element.role as 'button', { name: element.name, exact: true }).first();
    const b = await locator.boundingBox({ timeout: 1000 }).catch(() => null);
    if (!b) return undefined;
    const x = Math.max(0, b.x), y = Math.max(0, b.y);
    const right = Math.min(viewport.width, b.x + b.width), bottom = Math.min(viewport.height, b.y + b.height);
    if (right <= x || bottom <= y) return undefined;   // off the picture
    const round = (n: number) => Math.round(n * 10000) / 10000;
    return { x: round(x / viewport.width), y: round(y / viewport.height),
      w: round((right - x) / viewport.width), h: round((bottom - y) / viewport.height) };
  }

  async type(element: Seen, value: string): Promise<void> {
    const field = this.#page.getByRole(element.role as 'textbox', { name: element.name, exact: true })
      .or(this.#page.locator(`[name="${element.binding.name ?? ''}"]`)).first();
    await field.fill(value).catch(() => undefined);
    this.#typed.push({ field, value });
  }

  async press(element: Seen): Promise<void> {
    for (const t of this.#typed.splice(0)) {
      if ((await t.field.inputValue({ timeout: 2000 }).catch(() => null)) !== t.value) {
        await t.field.fill(t.value, { timeout: 5000 }).catch(() => undefined);
      }
    }
    const wasAt = this.#page.url();
    await this.#page.getByRole(element.role as 'button', { name: element.name, exact: true }).first()
      .click().catch(() => undefined);
    await settleAfterActivating(this.#page, wasAt);
  }

  async restart(path: string): Promise<void> {
    await this.#page.context().clearCookies();
    await this.open(path);
  }

  /** One step of the draft, carried out as it is, for a mapping that starts after it (Decision 17). */
  async replay(step: Step, typing: Typing): Promise<{ ok: true } | { ok: false; why: string }> {
    const page = this.#page;
    if (step.kind === 'open') { await this.open(step.path); return { ok: true }; }
    if (step.kind === 'handOff') { await page.context().clearCookies(); return { ok: true }; }
    const target = step.kind === 'enter' ? step.into : step.kind === 'activate' ? step.control : step.kind === 'read' ? step.region : null;
    if (!target) return { ok: false, why: `a ${step.kind} step is not replayed.` };
    if (step.kind === 'activate' && step.changesARecord) return { ok: false, why: 'it changes a record, and replay never does.' };
    const found = await resolveBinding(page, target.binding as never).catch(() => null);
    if (!found || found.found !== 'one') {
      if (step.kind === 'read' && !step.produces.required) return { ok: true };
      return { ok: false, why: found ? describeRefusal(target.label, found) : `"${target.label}" could not be looked for.` };
    }
    if (step.kind === 'enter') await found.locator.fill(toType(step.value, typing));
    if (step.kind === 'activate') {
      const wasAt = page.url();
      await found.locator.click();
      await settleAfterActivating(page, wasAt);
    }
    return { ok: true };
  }

  close(): Promise<void> { return this.#close(); }
}

export const lookInBrowser: OpenLooking = async (origin) => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  return new BrowserLooking(page, origin, async () => { await page.close(); await browser.close(); });
};
