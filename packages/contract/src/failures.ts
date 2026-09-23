/**
 * The two closed sets nobody had enumerated: what can go wrong, and what gets
 * written down.
 *
 * Both are stored on records that are never edited, which makes them as
 * expensive to change as the step kinds and gives them the same discipline: a
 * new member is a decision with a requirement behind it.
 *
 * The error kinds are §13's matrix, named for the situation rather than the
 * mechanism — "the control was not there", not "selector returned null" —
 * because §13 asks that a failure be typed so that a missing control, a
 * timeout and a refused authorisation get three different responses.
 */
import { object, z } from './zod.ts';

export const errorKind = z.enum([
  // ── Naming something on a page ────────────────────────────────────────────
  /** It was not there at all. */
  'controlNotFound',
  /** It was there more than once. A name that fits two things identifies
   *  neither, so this is a refusal rather than a tie to break (Decision 12). */
  'controlAmbiguous',
  /** It resolved, and what was found is not what was approved. A fallback
   *  would try something else here; corroboration stops. */
  'corroborationFailed',

  // ── Getting somewhere, and knowing you arrived ───────────────────────────
  'navigationFailed',
  'pageNotAsExpected',
  /** The version was not approved to reach that address. Checked before the
   *  navigation happens, never after. */
  'addressNotPermitted',

  // ── Values ───────────────────────────────────────────────────────────────
  /** The screen said something the declared type cannot hold. Never coerced;
   *  the raw text is kept, because it is what makes this fixable. */
  'valueNotOfDeclaredType',
  /** Required, and the region was empty. */
  'valueMissing',
  /** Comparing an absent value with anything other than absence. */
  'comparisonNotPossible',
  'checkFailed',

  // ── Repetition ───────────────────────────────────────────────────────────
  /** The list is longer than the version allows. Checked before the first
   *  pass, so nothing is half-done. */
  'ceilingReached',

  // ── Authority and credentials ────────────────────────────────────────────
  'credentialMissing',
  'authenticationFailed',
  'authorizationFailed',
  /** The step would change a record and the version has no such authority.
   *  Normally caught at publication and compiled into a hand off; reaching a
   *  run means something is wrong with the version. */
  'changeNotPermitted',

  // ── The world ────────────────────────────────────────────────────────────
  'applicationUnavailable',
  'timedOut',
  'interruptedByRestart',
  'retryExhausted',
  'cancelled',

  // ── Evidence ─────────────────────────────────────────────────────────────
  /** An artefact did not match the digest recorded when it was captured. It is
   *  reported, never served (§12). */
  'integrityFailure',

  // ── A green screen (Orbit 2.2) ─────────────────────────────────────────────
  /** The screen showing is not the one the step was mapped on. */
  'terminalScreenUnexpected',
  /** The host left the keyboard locked: a field that takes no input was typed
   *  into, or the host set an error. Never retried blindly. */
  'terminalKeyboardLocked',

  // ── Not reachable in slice 1, named so the set does not grow by accident ──
  'serviceResponseOffContract',
  'judgementUnavailable',
  'judgementBelowFloor',
  'pathReachesNothing',
]);
export type ErrorKind = z.infer<typeof errorKind>;

/** What a failed run stores. Always names the kind and the step (§13). */
export const runError = object({
  kind: errorKind,
  step: z.number().int().positive(),
  /** In the reader's terms, not the executor's. */
  describe: z.string().min(1).max(500),
  /** What the screen actually said, where that is what makes it fixable. */
  saw: z.string().max(2000).optional(),
  /**
   * What each application now holds, when the run stopped part-way (Orbit 2.2,
   * C14): the record-changing presses seen through, and one pressed and never
   * answered. While `unknown` stands and nobody has checked, the run is not
   * retried or run again (C15).
   */
  partial: object({
    changed: z.array(object({ application: z.string().nullable(), step: z.number().int().positive(), control: z.string() })),
    unknown: object({ application: z.string().nullable(), step: z.number().int().positive(), control: z.string() }).optional(),
  }).optional(),
});
export type RunError = z.infer<typeof runError>;

/**
 * Events are the record a run is reconstructed from (§10). The timeline is the
 * readable view; this is the complete one.
 */
export const eventKind = z.enum([
  // the run as a whole
  'run.queued', 'run.started', 'run.succeeded', 'run.failed',
  'run.cancelled', 'run.held', 'run.resumed', 'run.reconciled',
  // each attempt at a step
  'step.attempt.started', 'step.attempt.ended',
  // what a step did, one per kind that does something observable
  'navigated', 'entered', 'activated', 'read', 'read.absent',
  'collected', 'checked', 'branch.evaluated', 'ended',
  'handed.off', 'handed.back',
  // evidence and models
  'artefact.captured', 'artefact.withheld', 'model.called',
]);
export type EventKind = z.infer<typeof eventKind>;

/** Kinds a run may still be in. Slice 1 reaches the first six. */
export const ERRORS_REACHABLE_IN_SLICE_1: readonly ErrorKind[] = [
  'controlNotFound', 'controlAmbiguous', 'corroborationFailed',
  'navigationFailed', 'pageNotAsExpected', 'addressNotPermitted',
  'valueNotOfDeclaredType', 'valueMissing', 'comparisonNotPossible',
  'checkFailed', 'ceilingReached', 'credentialMissing',
  'applicationUnavailable', 'timedOut', 'interruptedByRestart', 'cancelled',
  'integrityFailure', 'pathReachesNothing',
];

/**
 * The failure kinds a retry could plausibly change.
 *
 * §10: "Retry re-attempts a failed step within the same run where the failure
 * kind is retryable", and §9 is blunter — "failures that will not improve on
 * repetition are not retried". So the test for membership is not whether a
 * failure is annoying, it is whether the second attempt is doing anything
 * different from the first.
 *
 * Four qualify, and each for the same reason: the failure is about the world
 * being briefly unavailable rather than about the workflow being wrong.
 *
 * Everything else is excluded on purpose, and the exclusions matter more than
 * the inclusions:
 *
 *   controlNotFound, controlAmbiguous, corroborationFailed — a binding that
 *     found nothing, found two things, or found the wrong thing will do so
 *     again. Decision 12 makes ambiguity a refusal rather than a tie to break,
 *     and a retry is exactly the tie-break it refuses.
 *   checkFailed — not a technical failure at all. It is the workflow saying
 *     the business condition did not hold, and repeating it to get a different
 *     answer is the opposite of what the step is for.
 *   integrityFailure — evidence did not match its digest. Retrying replaces
 *     the question with a fresh attempt, which is how a tampering signal gets
 *     lost.
 *   addressNotPermitted, credentialMissing, ceilingReached — each needs a
 *     person to change something first. A retry before that is a guess.
 *   cancelled — somebody asked for it to stop.
 */
export const RETRYABLE: ReadonlySet<ErrorKind> = new Set<ErrorKind>([
  /** The network, not the page. */
  'navigationFailed',
  /** Transient by definition; §13 sends the operator to retry once healthy. */
  'applicationUnavailable',
  'timedOut',
  /** A worker died mid-run. The reconciler's whole premise is that this says
   *  nothing about whether the work would succeed. */
  'interruptedByRestart',
]);

export const isRetryable = (kind: ErrorKind): boolean => RETRYABLE.has(kind);
