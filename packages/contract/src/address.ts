/**
 * Where a registered application actually is.
 *
 * The scheme lives here, with the host, because it is part of the address and
 * not a preference. Orbit built every origin as `http://` + the host: a
 * registration that named an https system was accepted, and then the recorder
 * opened it over http and landed on whatever the server says to someone who
 * asked the wrong way — an error page, a redirect loop, or a certificate
 * warning. After registration, which is the wrong place to find out.
 *
 * Kept in the contract rather than in either application because the API
 * writes it and the worker opens it, and the two agreeing about what an
 * address means is not something to leave to a template literal in seven
 * files.
 */
import { object, z } from './zod.ts';

/** A web application's http or https; a green screen's tn3270, or tn3270s over TLS (Orbit 2.2). */
export const scheme = z.enum(['http', 'https', 'tn3270', 'tn3270s']);
export type Scheme = z.infer<typeof scheme>;

export const address = object({
  /** Host and port only. A path belongs in `pathPrefix`. */
  host: z.string().min(1).max(255),
  pathPrefix: z.string().max(255).default('/'),
  /** Defaults to http, so an address registered before this existed still
   *  means what it meant when it was written. */
  scheme: scheme.default('http'),
});
export type Address = z.infer<typeof address>;

/**
 * The origin to open, from an address however old the record is.
 *
 * Takes the loosest possible shape on purpose: these come back out of jsonb,
 * from rows written before the scheme was stored, and from SQL that selects
 * one column. A missing scheme is http, which is what those rows meant.
 */
export function originOf(given: { host: string; scheme?: string | null } | null | undefined): string {
  const host = given?.host ?? '';
  const s = given?.scheme;
  return `${s === 'https' || s === 'tn3270' || s === 'tn3270s' ? s : 'http'}://${host}`;
}
