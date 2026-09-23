/**
 * What a step needs from the thing it is acting on.
 *
 * Decision 2, quoting the engineering instructions: "The layer that executes
 * must sit behind an interface, so a second surface can be added without
 * reopening the first." The executor imported Chromium directly, which made
 * the ten step kinds surface-neutral by assertion rather than by construction
 * — a terminal would have arrived as a rewrite of the file every browser step
 * also lives in.
 *
 * Decision 5 item 9 is the reason it has to be this shape. §7 says a designer
 * "never chooses a 'browser step' or a 'terminal step'", so a step cannot name
 * a surface and the surface has to be chosen at run time from the application.
 * That only works if what a step asks for is expressible without saying how it
 * will be done.
 *
 * What every surface must offer is therefore small, and stated in the
 * vocabulary of the step kinds rather than of any driver: go somewhere, find
 * one named thing, put a value in it, activate it, read it, wait for it to
 * settle, and hand back a picture of what is on it. Nothing here mentions a
 * DOM, a selector or a screen buffer.
 *
 * What is deliberately NOT here:
 *
 *   - Anything returning a driver's own object. `find` hands back operations,
 *     not a Locator, because a caller holding a Locator is a caller that has
 *     to know it is driving a browser.
 *   - A general "run this on the page" escape hatch. One would make every
 *     other method optional in practice, and the interface would stop being a
 *     description of what a step may do.
 */
import type { Binding, Strategy } from './binder.ts';

/**
 * One thing on the surface, and what may be done to it.
 *
 * `by` travels with it because the evidence record says which rung of the
 * ladder found the element, and that has to survive reaching the caller.
 */
export interface Found {
  readonly by: Strategy;
  /** §14's `enter`. The value is put in; how is the surface's business. */
  fill(value: string): Promise<void>;
  /** §14's `activate`. */
  activate(): Promise<void>;
  /** §14's `read`. Raw text, never coerced — the declared type is checked
   *  afterwards, and the raw text is what makes a mismatch fixable. */
  text(): Promise<string>;
  /**
   * Where it is, so the evidence can point at it.
   *
   * A reader can be told a step finds "whatever sits immediately after the
   * label Credit score" and still have no way to check that it found the
   * right thing. This is what lets the screenshot carry a box around the
   * element the step actually resolved to, which is the difference between
   * being told and being shown.
   *
   * Null where the surface has no geometry — a terminal knows rows and
   * columns, a service knows neither — and the evidence then simply carries
   * no box rather than a made-up one.
   */
  where(): Promise<{ x: number; y: number; width: number; height: number } | null>;
}

/**
 * Exactly one, or a refusal.
 *
 * Decision 12: ambiguity is a refusal rather than a tie to be broken, so
 * `many` is a distinct answer carrying its count and not a list to choose
 * from. A surface that returned the first of several would make the decision
 * unenforceable from here.
 */
export type Sought =
  | { found: 'one'; it: Found }
  | { found: 'none'; by: Strategy; why?: string;
      /** Set only when "not found" is really a different failure: a green
       *  screen showing another screen than the one mapped (Orbit 2.2). */
      kind?: 'terminalScreenUnexpected' }
  | { found: 'many'; count: number; by: Strategy };

export interface Surface {
  /** Named on the run record so a reader can tell what the agent was driving. */
  readonly kind: 'browser' | 'terminal' | 'service';

  /** §14's `open`. The path is relative; the surface holds the origin, so a
   *  step cannot navigate somewhere the version did not approve. */
  open(path: string, application?: string): Promise<void>;

  /** Wait until whatever an activation set off has finished. Separate from
   *  `activate` because `open` needs it too, and because a surface with no
   *  concept of loading can make it a no-op rather than pretend. */
  settle(): Promise<void>;

  find(binding: Binding): Promise<Sought>;

  /**
   * A picture of the surface as it now stands.
   *
   * Bytes and a media type, because a terminal's evidence is not a PNG and
   * the evidence store addresses content rather than trusting a file
   * extension. Decision 4 rules out video, so this is one moment, not a
   * recording.
   */
  capture(): Promise<{ bytes: Buffer; mediaType: string }>;

  close(): Promise<void>;

  /** Across applications (Orbit 2.2): which one has focus, and the account it
   *  signs in as. A surface for one application has neither. */
  application?(): string;
  signsInAs?(): string | null;
}

/**
 * How a surface is obtained for a run.
 *
 * A function rather than a class so that choosing one at run time is a lookup
 * in a table, which is what Decision 5 item 9 needs it to be.
 */
export type OpenSurface = (origin: string) => Promise<Surface>;
