/**
 * Makes the application's role sign in with the password `.env` gives it.
 *
 * Migration 0001 creates `orbit_app` only if no role by that name exists, and
 * a role belongs to the server rather than to a database. So a server that
 * already had an `orbit_app` — an earlier setup, another project, a volume
 * from months ago — keeps whatever password it was given then, every
 * migration succeeds, and the first thing that fails is the API, with
 * "password authentication failed for user orbit_app". That happened on a
 * second machine, and the fix was an ALTER ROLE nobody should have to know.
 *
 * `.env` is the truth, as it is for everything else setup does: the password
 * in ORBIT_DATABASE_URL is set on the role it names. Only when that role
 * cannot sign in with it — one that already can is left exactly as it is.
 *
 * Run as the owner, because `orbit_app` holds no DDL and cannot change itself.
 */
import { Client } from 'pg';

/** A wrong password (28P01), as opposed to a server that is not there. */
const refused = (error: unknown) =>
  typeof error === 'object' && error !== null && (error as { code?: string }).code === '28P01';

/** ALTER ROLE takes no parameters, so the name is quoted where it is built. */
const quoted = (name: string) => `"${name.replace(/"/g, '""')}"`;

export async function syncAppRole(
  ownerUrl: string,
  appUrl: string,
): Promise<'signs in' | 'password set' | 'no password to set'> {
  const app = new URL(appUrl);
  const role = decodeURIComponent(app.username);
  const password = decodeURIComponent(app.password);
  if (!role || !password) return 'no password to set';

  const probe = new Client({ connectionString: appUrl });
  try {
    await probe.connect();
    return 'signs in';
  } catch (error) {
    if (!refused(error)) throw error;
  } finally {
    await probe.end().catch(() => {});
  }

  const owner = new Client({ connectionString: ownerUrl });
  await owner.connect();
  try {
    await owner.query(`ALTER ROLE ${quoted(role)} PASSWORD ${owner.escapeLiteral(password)}`);
    return 'password set';
  } finally {
    await owner.end();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const owner = process.argv[2] ?? process.env['ORBIT_OWNER_DATABASE_URL'];
  const app = process.argv[3] ?? process.env['ORBIT_DATABASE_URL'];
  if (!owner || !app) throw new Error('Pass the owner and application connection strings, or set them in .env.');
  console.log(await syncAppRole(owner, app));
}
