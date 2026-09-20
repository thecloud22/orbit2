import type { ScreenDefinition } from './datastream';

/**
 * The practice copy of a service desk, as a green screen.
 *
 * The 3270 twin of `apps/demo-portal`, running the same business procedure
 * against the same record, so a terminal process can be authored, connected and
 * run end to end with no mainframe anywhere. It holds nothing, changes nothing
 * and writes nothing: every screen is a pure function of the request number
 * somebody typed.
 *
 * Text is upper case throughout because a 3270 terminal is, which is the first
 * thing that makes a green-screen workflow different from its browser twin: the
 * value a step extracts here is `IN PROGRESS`, not `In Progress`.
 */

export interface ServiceRequest {
  readonly requestNumber: string;
  readonly status: string;
  readonly assignedTeam: string;
}

/**
 * `SR-1001` is the Phase 1 record, deliberately identical to the browser
 * portal's. `SR-1002` exists so the detail screen is demonstrably a template
 * rather than a picture: the same binding has to read both.
 */
export const SERVICE_REQUESTS: readonly ServiceRequest[] = Object.freeze([
  Object.freeze({
    requestNumber: 'SR-1001',
    status: 'IN PROGRESS',
    assignedTeam: 'INFRASTRUCTURE OPERATIONS',
  }),
  Object.freeze({
    requestNumber: 'SR-1002',
    status: 'AWAITING PARTS',
    assignedTeam: 'FIELD SERVICES',
  }),
]);

/** Matching is exact, as it is in the browser portal and for the same reason. */
export function findServiceRequest(requestNumber: string): ServiceRequest | undefined {
  const normalized = requestNumber.trim().toUpperCase();

  if (normalized.length === 0) {
    return undefined;
  }

  return SERVICE_REQUESTS.find((request) => request.requestNumber === normalized);
}

const HEADER = {
  kind: 'caption',
  row: 0,
  column: 30,
  text: 'ORBIT SERVICE DESK',
  intense: true,
} as const;

/**
 * The screen a session opens on, and returns to.
 *
 * `message` is what makes this two screens rather than one as far as a workflow
 * is concerned: a search that found nothing comes back here with
 * `REQUEST NOT FOUND` on row 8, and that caption is the only thing a branch has
 * to point at to prove which way the process went.
 */
export function lookupScreen(message?: string): ScreenDefinition {
  return {
    name: message === undefined ? 'lookup' : `lookup:${message}`,
    cursorAt: 'requestNumber',
    elements: [
      HEADER,
      { kind: 'caption', row: 2, column: 2, text: 'SERVICE REQUEST LOOKUP' },
      { kind: 'caption', row: 5, column: 2, text: 'REQUEST NUMBER ===>' },
      { kind: 'input', name: 'requestNumber', row: 5, column: 22, length: 10 },
      ...(message === undefined
        ? []
        : ([{ kind: 'caption', row: 8, column: 2, text: message, intense: true }] as const)),
      { kind: 'caption', row: 22, column: 2, text: 'ENTER=SEARCH   PF3=EXIT' },
    ],
  };
}

/**
 * The record, laid out the way a CICS map would lay it out.
 *
 * Every value is a **protected** field. That is what a real host does with
 * output-only data -- and it is the reason `field_after_label` had to learn to
 * resolve a value as well as an input: on a screen like this one, the field
 * after `STATUS` is not something anybody can type into.
 */
export function detailScreen(request: ServiceRequest): ScreenDefinition {
  return {
    name: `detail:${request.requestNumber}`,
    elements: [
      HEADER,
      { kind: 'caption', row: 2, column: 2, text: 'SERVICE REQUEST DETAIL' },
      { kind: 'caption', row: 5, column: 2, text: 'REQUEST NUMBER :' },
      { kind: 'caption', row: 5, column: 22, text: request.requestNumber },
      { kind: 'caption', row: 7, column: 2, text: 'STATUS         :' },
      { kind: 'caption', row: 7, column: 22, text: request.status },
      { kind: 'caption', row: 9, column: 2, text: 'ASSIGNED TEAM  :' },
      { kind: 'caption', row: 9, column: 22, text: request.assignedTeam },
      { kind: 'caption', row: 22, column: 2, text: 'PF3=RETURN' },
    ],
  };
}

export const NOT_FOUND_MESSAGE = 'REQUEST NOT FOUND';
export const BLANK_MESSAGE = 'ENTER A REQUEST NUMBER';

export type SessionScreen =
  | { readonly kind: 'lookup'; readonly message?: string }
  | { readonly kind: 'detail'; readonly request: ServiceRequest };

export function render(screen: SessionScreen): ScreenDefinition {
  return screen.kind === 'lookup' ? lookupScreen(screen.message) : detailScreen(screen.request);
}

/**
 * What the next screen is, given what is showing and what was pressed.
 *
 * Pure and total: every state the host can be in is one of two, and every key is
 * either Enter, PF3, or a key this application does not use. Nothing here reads
 * the clock, the network or a store, so a session replays identically.
 */
export function advance(
  current: SessionScreen,
  key: 'enter' | 'pf3' | 'other',
  fields: ReadonlyMap<string, string>,
): SessionScreen {
  if (current.kind === 'detail') {
    return key === 'pf3' ? { kind: 'lookup' } : current;
  }

  if (key !== 'enter') {
    return current;
  }

  const typed = fields.get('requestNumber') ?? '';

  if (typed.trim().length === 0) {
    return { kind: 'lookup', message: BLANK_MESSAGE };
  }

  const request = findServiceRequest(typed);

  return request === undefined
    ? { kind: 'lookup', message: NOT_FOUND_MESSAGE }
    : { kind: 'detail', request };
}
