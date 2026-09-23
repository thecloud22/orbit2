/**
 * What building an agent needs from a screen (Orbit 2.2, rule C1).
 *
 * `Surface` is what a *run* needs; this is what the *walk* needs while an agent
 * is being built: to look at the screen as the numbered list the model is
 * shown, to act on one of those things, and to picture it. Each connector
 * implements both, and nothing above them learns which connector it is.
 *
 * It holds a live session for the length of one walk. The browser's lives in
 * `looking-browser.ts`, moved there unchanged from the walk itself; a green
 * screen's is a sibling of it.
 */
import type { Step } from '@orbit/contract';
import type { Seen } from './snapshot.ts';

/** Where an element sits on a picture, as fractions of its width and height. */
export interface Box { x: number; y: number; w: number; h: number }

/** What the walk types for a step: the same values a run would type. */
export interface Typing {
  inputs: Record<string, string>;
  signsInAs?: string | null;
  signsInWith?: string | null;
  /** What earlier steps read, for a step that enters one (Orbit 2.2). */
  values?: Record<string, string>;
}

export interface Looking {
  /** Where it is, as the model is told: an address, or a screen's name. */
  place(): string;
  /** Open a path of the application, as an `open` step does. */
  open(path: string): Promise<void>;
  /** The screen as the model is shown it. */
  look(): Promise<Seen[]>;
  /** What the screen visibly says, to notice a press that changed nothing. */
  visibleText(): Promise<string>;
  /** A picture of the screen now, or null where one cannot be taken. */
  picture(): Promise<{ bytes: Buffer; mediaType: string } | null>;
  /** Where an element is on the picture, if it is on it. */
  boxOf(element: Seen): Promise<Box | undefined>;
  /** Put a value into a field. Failures are the connector's to absorb: the
   *  walk carries on and the next look shows what happened. */
  type(element: Seen, value: string): Promise<void>;
  /** Press it and wait until the screen has settled. Anything typed since the
   *  last press that the screen has lost is typed again first. */
  press(element: Seen): Promise<void>;
  /** After a wait for a person: a new session, opened at this path. */
  restart(path: string): Promise<void>;
  /** A step of an earlier draft, carried out as it is (Decision 17). */
  replay(step: Step, typing: Typing): Promise<{ ok: true } | { ok: false; why: string }>;
  close(): Promise<void>;
}

/**
 * What the walk types into a field, taken from the step it just built.
 *
 * It used to be `inputs[p.value] ?? ''` — the author's example values, looked
 * up by whatever the model called the value. Three of the four kinds of thing
 * a step can carry are not in that map and never could be, so all three typed
 * an empty string:
 *
 *   A password. There is no example for one and there must not be, so the
 *   sign-in typed nothing into a required field, the browser refused the
 *   submit, and the walk sat on the login page for every remaining turn —
 *   mapping the rest of the procedure against a page it had never left.
 *
 *   The registered account, for the same reason.
 *
 *   A literal. A procedure naming the record it works on — "open the file
 *   ML-26-04502" — was looked up as `inputs["ML-26-04502"]`, so the loan
 *   number was never typed and the walk never reached the file.
 *
 * The step already says where its value comes from, and a walk that types what
 * the run will type is the only kind whose bindings mean anything. The
 * password is used here and nowhere else: what the step carries is the
 * credential's name.
 */
export function toType(value: Extract<Step, { kind: 'enter' }>['value'], opts: Typing): string {
  if (value.from === 'input') return opts.inputs[value.value] ?? '';
  if (value.from === 'step') {
    const read = opts.values?.[value.value] ?? '';
    if (!('codes' in value)) return read;
    const code = Object.entries(value.codes).find(([from]) => from.trim().toLowerCase() === read.trim().toLowerCase());
    return code ? code[1] : read;
  }
  if (value.from === 'account') return opts.signsInAs ?? '';
  if (value.from === 'secret') return opts.signsInWith ?? '';
  if (value.from === 'literal') {
    const l = value.literal;
    return l.type === 'text' ? l.text
      : l.type === 'number' ? String(l.number)
      : l.type === 'date' ? l.date
      : l.type === 'yesNo' ? (l.yesNo ? 'yes' : 'no')
      : '';
  }
  return '';
}

/** How a walk's session is obtained, from the application's origin. */
export type OpenLooking = (origin: string) => Promise<Looking>;
