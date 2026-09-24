/**
 * The browser surface: the only file in the worker that knows about Playwright.
 *
 * That is the whole point of it. Decision 2 asks that a second surface be
 * addable "without reopening the first", and the test of whether that holds is
 * whether a terminal implementation would need to touch `execute.ts`. It would
 * not; it would be a sibling of this file.
 *
 * The binding ladder stays in `binder.ts` rather than moving here, because the
 * ladder is a decision about evidence — Decision 15 ordered it by how often
 * each rung is measurably *wrong* — and a second surface with its own way of
 * naming things must not be able to quietly relax it.
 */
import { chromium, type Browser, type Page } from 'playwright';
import { FIND_WAIT_MS, resolve } from './binder.ts';
import { settleAfterActivating, settlePage, watchRequests } from './looking-browser.ts';
import type { Found, OpenSurface, Sought, Surface } from './surface.ts';

class BrowserSurface implements Surface {
  readonly kind = 'browser' as const;
  #browser: Browser;
  #page: Page;
  #origin: string;
  /** Where the page was when a control was last pressed, so settling can
   *  wait for the navigation that press causes rather than for the page it left. */
  #pressedAt: string | null = null;

  constructor(browser: Browser, page: Page, origin: string) {
    this.#browser = browser;
    this.#page = page;
    this.#origin = origin;
  }

  async open(path: string): Promise<void> {
    await this.#page.goto(`${this.#origin}${path}`, { waitUntil: 'domcontentloaded' });
    await settlePage(this.#page);
  }

  /**
   * After a press, until the application has drawn what it answered. It
   * waited for `domcontentloaded`, which the page it was leaving had already
   * reached, so the next step and the picture after a press were both taken
   * of the old screen or of a blank one. The same wait authoring uses.
   */
  async settle(): Promise<void> {
    const wasAt = this.#pressedAt ?? this.#page.url();
    this.#pressedAt = null;
    await settleAfterActivating(this.#page, wasAt);
  }

  async find(binding: Parameters<typeof resolve>[1]): Promise<Sought> {
    const found = await resolve(this.#page, binding, { waitMs: FIND_WAIT_MS });
    if (found.found !== 'one') return found;

    // The Locator is wrapped rather than handed back. A caller holding one is
    // a caller that knows it is driving a browser, and that is exactly the
    // knowledge this file exists to contain.
    const it: Found = {
      by: found.by,
      fill: (value) => found.locator.fill(value),
      activate: () => { this.#pressedAt = this.#page.url(); return found.locator.click(); },
      text: () => found.locator.innerText(),
      where: () => found.locator.boundingBox(),
    };
    return { found: 'one', it };
  }

  async capture(): Promise<{ bytes: Buffer; mediaType: string }> {
    return { bytes: await this.#page.screenshot(), mediaType: 'image/png' };
  }

  async close(): Promise<void> {
    await this.#page.close();
    await this.#browser.close();
  }
}

export const openBrowser: OpenSurface = async (origin) => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  watchRequests(page);
  return new BrowserSurface(browser, page, origin);
};
