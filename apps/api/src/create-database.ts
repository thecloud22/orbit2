/**
 * Creates a database, so that `migrate.ts` has one to fill.
 *
 * This was two psql commands in `scripts/setup`, which made the postgres
 * *client* a prerequisite on every machine — for one query and one statement,
 * in a repository that already carries a postgres driver and uses it for
 * everything else it does. A server in a container makes that plainly silly:
 * postgres is right there, and psql would be a separate install on the host
 * purely so a shell script can run CREATE DATABASE.
 *
 * It connects to the maintenance database on the same server, because a
 * database cannot be created from inside itself, and as the owner, because
 * `orbit_app` holds no DDL at all — the arrangement that makes the immutable
 * tables immutable, and the same reason migrations do not run as it.
 */
import { Client } from 'pg';

/**
 * CREATE DATABASE takes no parameters, so the name is quoted rather than
 * bound. It comes from a URL in `.env` rather than from anything a user of
 * the product types, but a name that reaches SQL by string is quoted where it
 * is built, every time, rather than where somebody judged it safe.
 */
const quoted = (name: string) => `"${name.replace(/"/g, '""')}"`;

/** The same server, addressed at the database every postgres has. */
function maintenance(url: URL): string {
  const admin = new URL(url);
  admin.pathname = '/postgres';
  return admin.toString();
}

export async function createDatabase(url: string): Promise<'created' | 'already there'> {
  const target = new URL(url);
  const name = decodeURIComponent(target.pathname.replace(/^\//, ''));
  if (!name) throw new Error(`${url} names a server but no database`);

  const client = new Client({ connectionString: maintenance(target) });
  await client.connect();
  try {
    const { rows } = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [name]);
    if (rows.length > 0) return 'already there';
    await client.query(`CREATE DATABASE ${quoted(name)}`);
    return 'created';
  } finally {
    await client.end();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  // Named on the command line by setup, one call per database, so that which
  // databases exist is decided in one place and not in two.
  const url = process.argv[2] ?? process.env['ORBIT_OWNER_DATABASE_URL'];
  if (!url) throw new Error('Pass a connection string, or set ORBIT_OWNER_DATABASE_URL.');
  console.log(await createDatabase(url));
}
