/**
 * The connectors this worker can drive, by the surface an application is
 * registered with (Orbit 2.2, C1–C4).
 *
 * A connector pairs the two things Orbit ever asks of a kind of screen: how a
 * *run* acts on it (`Surface`) and how the *walk* looks at it while an agent
 * is built (`Looking`). Decision 5 item 9 keeps the choice out of every step:
 * it is made here, from the application, and nothing downstream learns which.
 *
 * In its own file, not in `main.ts`, so that it can be imported — by a test,
 * or by anything asking what this deployment can execute — without starting a
 * worker loop.
 */
import type { OpenLooking } from './looking.ts';
import { lookInBrowser } from './looking-browser.ts';
import { openBrowser } from './surface-browser.ts';
import type { OpenSurface } from './surface.ts';

export interface Connector {
  /** How a run acts on the application. */
  run: OpenSurface;
  /** How the walk looks at it while an agent is built. */
  look: OpenLooking;
  /** Whether this worker has what the connector needs, said in words when not. */
  ready(): Promise<{ ready: true } | { ready: false; why: string }>;
}

export const CONNECTORS: Partial<Record<string, Connector>> = {
  browser: { run: openBrowser, look: lookInBrowser, ready: async () => ({ ready: true }) },
};
