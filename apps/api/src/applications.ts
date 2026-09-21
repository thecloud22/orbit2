/**
 * Registering an application, and editing one that is already registered.
 *
 * Decision 5 keeps two things apart: the application's identity and
 * operational state (name, surface, owner note, retirement) versus an
 * append-only sequence of definition revisions (addresses, sign-in identity,
 * credential name, formats). An edit updates the first in place and mints a
 * new revision of the second — it never rewrites one. Surface is decided at
 * registration and stays fixed afterwards: it picks which step kinds and
 * locator rules apply, so changing it is a different kind of registration,
 * not an edit to this one.
 *
 * There is no password field here, and there cannot be (§8): a credential is
 * referred to by name, and the value is supplied to the deployment
 * separately, never through this path.
 */
import type { PoolClient } from 'pg';
import { object, z } from '@orbit/contract';

const address = object({
  host: z.string().trim().min(1).max(255),
  pathPrefix: z.string().trim().max(255).default('/'),
});

const formats = object({
  date: z.string().trim().max(40).optional(),
  thousands: z.string().trim().max(4).optional(),
  decimal: z.string().trim().max(4).optional(),
});

const connectionFields = {
  addresses: z.array(address).min(1, 'needs at least one address').max(8),
  signInAs: z.string().trim().max(120).optional(),
  credentialName: z.string().trim().max(120).optional(),
  formats: formats.optional(),
};

export const registration = object({
  name: z.string().trim().min(1, 'needs a name').max(120),
  surface: z.enum(['browser', 'terminal']),
  ownerNote: z.string().trim().max(500).optional(),
  ...connectionFields,
});

export const edit = object({
  name: z.string().trim().min(1, 'needs a name').max(120),
  ownerNote: z.string().trim().max(500).optional(),
  ...connectionFields,
});

export type ApplicationResult =
  | { ok: true; id: string; revision: number }
  | { ok: false; because: string; notFound?: true };

const issues = (error: z.ZodError) =>
  error.issues.map((i) => `${i.path.join('.') || 'the application'}: ${i.message}`).join('; ');

type Connection = { addresses: unknown; signInAs: string | undefined; credentialName: string | undefined; formats: unknown };
type StoredConnection = { addresses: unknown; sign_in_as: string | null; credential_name: string | null; formats: unknown };

/** Whether an edit actually changes what a revision would carry, so an edit
 *  that only renames the application does not mint a revision nobody asked for. */
function sameConnection(stored: StoredConnection, given: Connection): boolean {
  return JSON.stringify(stored.addresses) === JSON.stringify(given.addresses)
    && (stored.sign_in_as ?? null) === (given.signInAs ?? null)
    && (stored.credential_name ?? null) === (given.credentialName ?? null)
    && JSON.stringify(stored.formats ?? {}) === JSON.stringify(given.formats ?? {});
}

export async function registerApplication(db: PoolClient, body: unknown): Promise<ApplicationResult> {
  const checked = registration.safeParse(body);
  if (!checked.success) return { ok: false, because: issues(checked.error) };
  const { name, surface, ownerNote, addresses, signInAs, credentialName, formats: fmt } = checked.data;

  await db.query('BEGIN');
  try {
    const { rows: [app] } = await db.query<{ id: string }>(
      `INSERT INTO application (name, surface, owner_note) VALUES ($1, $2, $3) RETURNING id`,
      [name, surface, ownerNote ?? null]);
    await db.query(
      `INSERT INTO application_revision (application_id, revision, addresses, sign_in_as, credential_name, formats)
       VALUES ($1, 1, $2, $3, $4, $5)`,
      [app!.id, JSON.stringify(addresses), signInAs ?? null, credentialName ?? null, JSON.stringify(fmt ?? {})]);
    await db.query(
      `INSERT INTO audit_entry (act, object_kind, object_id, changed)
       VALUES ('application registered', 'application', $1, $2)`,
      [app!.id, JSON.stringify({ name, surface })]);
    await db.query('COMMIT');
    return { ok: true, id: app!.id, revision: 1 };
  } catch (error) { await db.query('ROLLBACK'); throw error; }
}

export async function editApplication(db: PoolClient, id: string, body: unknown): Promise<ApplicationResult> {
  const checked = edit.safeParse(body);
  if (!checked.success) return { ok: false, because: issues(checked.error) };
  const { name, ownerNote, addresses, signInAs, credentialName, formats: fmt } = checked.data;

  const { rows: [existing] } = await db.query<{ name: string; owner_note: string | null }>(
    `SELECT name, owner_note FROM application WHERE id = $1`, [id]);
  if (!existing) return { ok: false, because: 'There is no such application.', notFound: true };

  const { rows: [latest] } = await db.query<{ revision: number } & StoredConnection>(
    `SELECT revision, addresses, sign_in_as, credential_name, formats FROM application_revision
      WHERE application_id = $1 ORDER BY revision DESC LIMIT 1`, [id]);
  if (!latest) return { ok: false, because: 'There is no such application.', notFound: true };

  const given: Connection = { addresses, signInAs, credentialName, formats: fmt };
  const renamed = existing.name !== name || (existing.owner_note ?? null) !== (ownerNote ?? null);
  const reconnected = !sameConnection(latest, given);
  if (!renamed && !reconnected) return { ok: true, id, revision: latest.revision };

  await db.query('BEGIN');
  try {
    if (renamed) {
      await db.query(`UPDATE application SET name = $2, owner_note = $3 WHERE id = $1`, [id, name, ownerNote ?? null]);
    }
    const revision = reconnected ? latest.revision + 1 : latest.revision;
    if (reconnected) {
      await db.query(
        `INSERT INTO application_revision (application_id, revision, addresses, sign_in_as, credential_name, formats)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [id, revision, JSON.stringify(addresses), signInAs ?? null, credentialName ?? null, JSON.stringify(fmt ?? {})]);
    }
    await db.query(
      `INSERT INTO audit_entry (act, object_kind, object_id, changed, reason)
       VALUES ('application edited', 'application', $1, $2, $3)`,
      [id, JSON.stringify({ revision }),
       [renamed && 'its name or owner note', reconnected && 'where it is reached or how it signs in']
         .filter(Boolean).join('; ')]);
    await db.query('COMMIT');
    return { ok: true, id, revision };
  } catch (error) { await db.query('ROLLBACK'); throw error; }
}
