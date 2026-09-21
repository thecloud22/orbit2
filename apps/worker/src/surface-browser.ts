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
import { resolve } from './binder.ts';
import type { Found, OpenSurface, Sought, Surface } from './surface.ts';

class BrowserSurface implements Surface {
  readonly kind = 'browser' as const;
  #browser: Browser;
  #page: Page;
  #origin: string;

  constructor(browser: Browser, page: Page, origin: string) {
    this.#browser = browser;
    this.#page = page;
    this.#origin = origin;
  }

  async open(path: string): Promise<void> {
    await this.#page.goto(`${this.#origin}${path}`, { waitUntil: 'domcontentloaded' });
  }

  async settle(): Promise<void> {
    await this.#page.waitForLoadState('domcontentloaded');
  }

  async find(binding: Parameters<typeof resolve>[1]): Promise<Sought> {
    const found = await resolve(this.#page, binding);
    if (found.found !== 'one') return found;

    // The Locator is wrapped rather than handed back. A caller holding one is
    // a caller that knows it is driving a browser, and that is exactly the
    // knowledge this file exists to contain.
    const it: Found = {
      by: found.by,
      fill: (value) => found.locator.fill(value),
      activate: () => found.locator.click(),
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
  return new BrowserSurface(browser, await browser.newPage(), origin);
};
