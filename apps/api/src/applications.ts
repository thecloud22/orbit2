/**
 * Registering an application, and editing one that is already registered.
 *
 * Decision 5 keeps two things apart: the application's identity (name,
 * surface, retirement) versus an append-only sequence of definition
 * revisions (addresses, sign-in identity, credential name). An edit updates
 * the first in place and mints a new revision of the second — it never
 * rewrites one. Surface is decided at registration and stays fixed
 * afterwards: it picks which step kinds and locator rules apply, so changing
 * it is a different kind of registration, not an edit to this one.
 *
 * Credential name is not the credential: it is the name a value is filed
 * under, and it is what the revision carries. A value offered alongside it
 * (migration 0014 amends Decision 5 item 5 to allow this) is encrypted and
 * filed under that name in a separate table, keyed by name rather than by
 * application — the same name may be shared by several applications, and
 * rotating it never mints a revision, because nothing in the registry refers
 * to the value itself. See credentials.ts for where it goes and how.
 */
import type { PoolClient } from 'pg';
import { object, scheme as schemeOf, z } from '@orbit/contract';
import { setCredential } from './credentials.ts';

/**
 * The host and port, out of whatever somebody pasted.
 *
 * A run opens the application at the scheme plus this, so a scheme left in
 * here produced `http://http://localhost:4101` and every run and every
 * recording failed with a name that could not be resolved — after the
 * registration had been accepted, which is the wrong place to find out.
 */
const host = z.string().trim().min(1).max(255)
  .refine((h) => h.length > 0, 'needs a host')
  .refine((h) => !h.includes('/'), 'is the host and port only — a path belongs in the box beside it')
  .refine((h) => /^(\[[0-9A-Fa-f:]+\]|[A-Za-z0-9._-]+)(:\d{1,5})?$/.test(h),
    'does not look like a host and port');

/**
 * The scheme is taken out of what was pasted, not thrown away.
 *
 * It used to be stripped, on the grounds that copying an address out of a
 * browser's bar is the obvious thing to do and there was only one thing it
 * could have meant. There was not. Every origin was then built as `http://`,
 * so registering an https system was accepted and the recorder opened it over
 * http and hit an error page — the scheme had been read, understood, and
 * discarded.
 *
 * Absent, it is http, which is what every address registered before this
 * meant. Port 443 is taken as https, because nothing else is served there and
 * a bare `portal.example.com:443` is somebody who did not think to type the
 * scheme rather than somebody asking for cleartext.
 */
const address = z.preprocess((given) => {
  if (!given || typeof given !== 'object' || Array.isArray(given)) return given;
  const a = given as Record<string, unknown>;
  if (typeof a['host'] !== 'string') return given;

  const pasted = a['host'].trim().replace(/\/+$/, '');
  const written = pasted.match(/^([A-Za-z][A-Za-z0-9+.-]*):\/\//);
  const rest = written ? pasted.slice(written[0].length) : pasted;
  const named = written?.[1]?.toLowerCase();

  return {
    ...a,
    host: rest,
    scheme: a['scheme'] ?? (named === 'https' || named === 'http' || named === 'tn3270' || named === 'tn3270s' ? named
      : /:443$/.test(rest) ? 'https' : 'http'),
  };
}, object({
  host,
  pathPrefix: z.string().trim().max(255).default('/'),
  scheme: schemeOf.default('http'),
}));

/** How s3270 is told to speak to a green screen (Orbit 2.2). Absent for a web application. */
const terminal = object({
  codePage: z.string().trim().regex(/^[A-Za-z0-9_-]{1,32}$/, 'is a code page name, like cp037').optional(),
  model: z.string().trim().regex(/^(327[89]-)?[2-5](-E)?$/, 'is a screen model, like 3278-2').optional(),
  luName: z.string().trim().regex(/^[A-Za-z0-9@#$.-]{1,32}$/, 'is an LU name').optional(),
}).optional();

const connectionFields = {
  addresses: z.array(address).min(1, 'needs at least one address').max(8),
  terminal,
  signInAs: z.string().trim().max(120).optional(),

  // The password itself, filed under a name Orbit derives. Never
  // read back by anything — see admin.ts's comment on that.
  credentialValue: z.string().min(1).max(2000).optional(),
};

/**
 * What this application's password is filed under.
 *
 * Derived, not typed. It is the key of a row in one table, which is Orbit's
 * bookkeeping and not a decision anybody registering a system should have to
 * make — asking for it put a third field on the form whose only correct
 * answer was "something nobody else used".
 *
 * From the id rather than the name, because renaming an application is
 * allowed and a credential that moved when somebody fixed a typo would
 * quietly stop resolving at run time. Prefixed because a credential name must
 * start with a letter and a uuid may not.
 */
const credentialFor = (applicationId: string) => `app_${applicationId.replaceAll('-', '')}`;

export const registration = object({
  name: z.string().trim().min(1, 'needs a name').max(120),
  surface: z.enum(['browser', 'terminal']),
  ...connectionFields,
});

export const edit = object({
  name: z.string().trim().min(1, 'needs a name').max(120),
  ...connectionFields,
});

export type ApplicationResult =
  | { ok: true; id: string; revision: number }
  | { ok: false; because: string; notFound?: true };

const issues = (error: z.ZodError) =>
  error.issues.map((i) => `${i.path.join('.') || 'the application'}: ${i.message}`).join('; ');

type Connection = { addresses: unknown; signInAs: string | undefined; credentialName: string | undefined; terminal?: unknown };
type StoredConnection = { addresses: unknown; sign_in_as: string | null; credential_name: string | null; terminal?: unknown };

/**
 * An address as a list, so comparing two of them cannot depend on key order.
 *
 * `JSON.stringify` was being compared directly, and jsonb does not store keys
 * in the order they were written — it orders them by length. With `host` and
 * `pathPrefix` that happened to match the order the schema declares, so it
 * worked; adding `scheme` put the stored form at host, scheme, pathPrefix and
 * the given form at host, pathPrefix, scheme. Every edit then looked like a
 * reconnection and minted a revision nobody asked for, which for an immutable
 * record is not a cosmetic fault.
 *
 * It was working by coincidence, and the coincidence was one field away.
 */
const canonical = (addresses: unknown): string =>
  JSON.stringify((Array.isArray(addresses) ? addresses : []).map((given) => {
    const a = (given ?? {}) as Record<string, unknown>;
    return [a['host'] ?? '', a['pathPrefix'] ?? '/', a['scheme'] ?? 'http'];
  }));

/** Whether an edit actually changes what a revision would carry, so an edit
 *  that only renames the application does not mint a revision nobody asked for. */
function sameConnection(stored: StoredConnection, given: Connection): boolean {
  const settings = (t: unknown) => JSON.stringify(Object.entries((t ?? {}) as Record<string, unknown>).sort());
  return canonical(stored.addresses) === canonical(given.addresses)
    && settings(stored.terminal) === settings(given.terminal)
    && (stored.sign_in_as ?? null) === (given.signInAs ?? null)
    && (stored.credential_name ?? null) === (given.credentialName ?? null);
}

export async function registerApplication(db: PoolClient, body: unknown): Promise<ApplicationResult> {
  const checked = registration.safeParse(body);
  if (!checked.success) return { ok: false, because: issues(checked.error) };
  const { name, surface, addresses, signInAs, credentialValue, terminal: settings } = checked.data;
  // A green screen is reached over TN3270, and a web application is not (C3).
  const green = addresses.every((a) => a.scheme === 'tn3270' || a.scheme === 'tn3270s');
  if (surface === 'terminal' && !green) return { ok: false, because: 'A green-screen application is reached as tn3270:// (or tn3270s:// with TLS), host and port.' };
  if (surface === 'browser' && addresses.some((a) => a.scheme === 'tn3270' || a.scheme === 'tn3270s')) {
    return { ok: false, because: 'A web application is reached over http or https; tn3270 is for a green screen.' };
  }

  await db.query('BEGIN');
  try {
    const { rows: [app] } = await db.query<{ id: string }>(
      `INSERT INTO application (name, surface) VALUES ($1, $2) RETURNING id`,
      [name, surface]);
    await db.query(
      `INSERT INTO application_revision (application_id, revision, addresses, sign_in_as, credential_name, terminal)
       VALUES ($1, 1, $2, $3, $4, $5)`,
      [app!.id, JSON.stringify(addresses), signInAs ?? null, credentialFor(app!.id),
       surface === 'terminal' ? JSON.stringify(settings ?? {}) : null]);
    if (credentialValue) await setCredential(db, credentialFor(app!.id), credentialValue);
    await db.query(
      `INSERT INTO audit_entry (act, object_kind, object_id, changed)
       VALUES ('application registered', 'application', $1, $2)`,
      [app!.id, JSON.stringify({ name, surface, credentialSet: Boolean(credentialValue) })]);
    await db.query('COMMIT');
    return { ok: true, id: app!.id, revision: 1 };
  } catch (error) { await db.query('ROLLBACK'); throw error; }
}

export async function editApplication(db: PoolClient, id: string, body: unknown): Promise<ApplicationResult> {
  const checked = edit.safeParse(body);
  if (!checked.success) return { ok: false, because: issues(checked.error) };
  const { name, addresses, signInAs, credentialValue, terminal: settings } = checked.data;

  const { rows: [existing] } = await db.query<{ name: string }>(
    `SELECT name FROM application WHERE id = $1`, [id]);
  if (!existing) return { ok: false, because: 'There is no such application.', notFound: true };

  const { rows: [latest] } = await db.query<{ revision: number } & StoredConnection>(
    `SELECT revision, addresses, sign_in_as, credential_name, terminal FROM application_revision
      WHERE application_id = $1 ORDER BY revision DESC LIMIT 1`, [id]);
  if (!latest) return { ok: false, because: 'There is no such application.', notFound: true };

  const given: Connection = { addresses, signInAs, credentialName: credentialFor(id),
    ...(latest.terminal !== null && latest.terminal !== undefined ? { terminal: settings ?? {} } : {}) };
  const renamed = existing.name !== name;
  const reconnected = !sameConnection(latest, given);
  // A value can be set with nothing else changing — rotation replaces a value
  // nothing in the registry refers to, so it is not tied to a revision.
  const settingCredential = Boolean(credentialValue);
  if (!renamed && !reconnected && !settingCredential) return { ok: true, id, revision: latest.revision };

  await db.query('BEGIN');
  try {
    if (renamed) {
      await db.query(`UPDATE application SET name = $2 WHERE id = $1`, [id, name]);
    }
    const revision = reconnected ? latest.revision + 1 : latest.revision;
    if (reconnected) {
      await db.query(
        `INSERT INTO application_revision (application_id, revision, addresses, sign_in_as, credential_name, terminal)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [id, revision, JSON.stringify(addresses), signInAs ?? null, credentialFor(id),
         latest.terminal !== null && latest.terminal !== undefined ? JSON.stringify(settings ?? {}) : null]);
    }
    if (credentialValue) await setCredential(db, credentialFor(id), credentialValue);
    await db.query(
      `INSERT INTO audit_entry (act, object_kind, object_id, changed, reason)
       VALUES ('application edited', 'application', $1, $2, $3)`,
      [id, JSON.stringify({ revision }),
       [renamed && 'its name', reconnected && 'where it is reached or how it signs in',
        settingCredential && 'its credential value']
         .filter(Boolean).join('; ')]);
    await db.query('COMMIT');
    return { ok: true, id, revision };
  } catch (error) { await db.query('ROLLBACK'); throw error; }
}
