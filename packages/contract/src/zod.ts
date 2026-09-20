/**
 * The only way this repository builds an object schema.
 *
 * Zod's `z.object()` *strips* keys it does not know about, silently. Two
 * decisions forbid exactly that: a command must never be able to accept an
 * actor from its caller (Decision 1), and validation at a boundary rejects
 * unknown keys rather than dropping them (Decision 9). A stripped key is a
 * caller being told "fine" about something that was ignored.
 *
 * So `object()` here is always strict, and a lint rule bans `z.object` outside
 * this file. The bound is structural rather than remembered, which is the same
 * shape as every other guarantee in the product.
 */
import { z } from 'zod';

export function object<T extends z.ZodRawShape>(shape: T) {
  return z.strictObject(shape);
}

/** A name a person typed that other things refer to: a value, a step, an outcome. */
export const name = z
  .string()
  .min(1)
  .max(64)
  .regex(/^[a-z][a-zA-Z0-9]*$/, 'starts with a lower-case letter, then letters and digits');

/**
 * Proves a discriminated union was handled exhaustively.
 *
 * Every closed set in Orbit — step kinds, value types, statuses, errors, events
 * — is a union, and Decision 9 asks that adding a member fails the build at
 * every site that must handle it. Calling this in a `default:` branch is what
 * makes that true.
 */
export function unreachable(value: never, what: string): never {
  throw new Error(`${what}: unhandled ${JSON.stringify(value)}`);
}

export { z };
