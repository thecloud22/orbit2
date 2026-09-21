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
import { object, z } from '@orbit/contract';
import { setCredential } from './credentials.ts';

const address = object({
  host: z.string().trim().min(1).max(255),
  pathPrefix: z.string().trim().max(255).default('/'),
});

const connectionFields = {
  addresses: z.array(address).min(1, 'needs at least one address').max(8),
  signInAs: z.string().trim().max(120).optional(),
  credentialName: z.string().trim().max(120).optional(),
  // The value, if this call is also filing one under credentialName. Never
  // read back by anything — see admin.ts's comment on that.
  credentialValue: z.string().min(1).max(2000).optional(),
};

const aValueNeedsAName = (data: { credentialName?: string | undefined; credentialValue?: string | undefined }) =>
  !data.credentialValue || Boolean(data.credentialName?.trim());
const aValueNeedsANameIssue = {
  message: 'a credential value needs a credential name to be filed under', path: ['credentialValue'],
};

export const registration = object({
  name: z.string().trim().min(1, 'needs a name').max(120),
  surface: z.enum(['browser', 'terminal']),
  ...connectionFields,
}).refine(aValueNeedsAName, aValueNeedsANameIssue);

export const edit = object({
  name: z.string().trim().min(1, 'needs a name').max(120),
  ...connectionFields,
}).refine(aValueNeedsAName, aValueNeedsANameIssue);

export type ApplicationResult =
  | { ok: true; id: string; revision: number }
  | { ok: false; because: string; notFound?: true };

const issues = (error: z.ZodError) =>
  error.issues.map((i) => `${i.path.join('.') || 'the application'}: ${i.message}`).join('; ');

type Connection = { addresses: unknown; signInAs: string | undefined; credentialName: string | undefined };
type StoredConnection = { addresses: unknown; sign_in_as: string | null; credential_name: string | null };

/** Whether an edit actually changes what a revision would carry, so an edit
 *  that only renames the application does not mint a revision nobody asked for. */
function sameConnection(stored: StoredConnection, given: Connection): boolean {
  return JSON.stringify(stored.addresses) === JSON.stringify(given.addresses)
    && (stored.sign_in_as ?? null) === (given.signInAs ?? null)
    && (stored.credential_name ?? null) === (given.credentialName ?? null);
}

export async function registerApplication(db: PoolClient, body: unknown): Promise<ApplicationResult> {
  const checked = registration.safeParse(body);
  if (!checked.success) return { ok: false, because: issues(checked.error) };
  const { name, surface, addresses, signInAs, credentialName, credentialValue } = checked.data;

  await db.query('BEGIN');
  try {
    const { rows: [app] } = await db.query<{ id: string }>(
      `INSERT INTO application (name, surface) VALUES ($1, $2) RETURNING id`,
      [name, surface]);
    await db.query(
      `INSERT INTO application_revision (application_id, revision, addresses, sign_in_as, credential_name)
       VALUES ($1, 1, $2, $3, $4)`,
      [app!.id, JSON.stringify(addresses), signInAs ?? null, credentialName ?? null]);
    if (credentialValue && credentialName) await setCredential(db, credentialName, credentialValue);
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
  const { name, addresses, signInAs, credentialName, credentialValue } = checked.data;

  const { rows: [existing] } = await db.query<{ name: string }>(
    `SELECT name FROM application WHERE id = $1`, [id]);
  if (!existing) return { ok: false, because: 'There is no such application.', notFound: true };

  const { rows: [latest] } = await db.query<{ revision: number } & StoredConnection>(
    `SELECT revision, addresses, sign_in_as, credential_name FROM application_revision
      WHERE application_id = $1 ORDER BY revision DESC LIMIT 1`, [id]);
  if (!latest) return { ok: false, because: 'There is no such application.', notFound: true };

  const given: Connection = { addresses, signInAs, credentialName };
  const renamed = existing.name !== name;
  const reconnected = !sameConnection(latest, given);
  // A value can be set with nothing else changing — rotation replaces a value
  // nothing in the registry refers to, so it is not tied to a revision.
  const settingCredential = Boolean(credentialValue && credentialName);
  if (!renamed && !reconnected && !settingCredential) return { ok: true, id, revision: latest.revision };

  await db.query('BEGIN');
  try {
    if (renamed) {
      await db.query(`UPDATE application SET name = $2 WHERE id = $1`, [id, name]);
    }
    const revision = reconnected ? latest.revision + 1 : latest.revision;
    if (reconnected) {
      await db.query(
        `INSERT INTO application_revision (application_id, revision, addresses, sign_in_as, credential_name)
         VALUES ($1, $2, $3, $4, $5)`,
        [id, revision, JSON.stringify(addresses), signInAs ?? null, credentialName ?? null]);
    }
    if (credentialValue && credentialName) await setCredential(db, credentialName, credentialValue);
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
