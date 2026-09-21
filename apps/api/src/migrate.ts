/**
 * Applies the SQL in `migrations/`, in order, once each.
 *
 * Hand-written SQL rather than generated DDL, because the guarantees are the
 * point: the revoked privileges and the refuse-mutation triggers are the whole
 * of Decision 3, and they have to be reviewable in the diff. A generator that
 * produced CREATE TABLE and left those out would be generating the easy half.
 *
 * Runs as the owner. The application connects as `orbit_app` and could not
 * apply these even if it tried, which is the arrangement working.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from 'pg';

const migrations = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations');

export async function migrate(connectionString: string): Promise<string[]> {
  const client = new Client({ connectionString });
  await client.connect();
  const applied: string[] = [];
  try {
    const already = new Set<string>();
    const table = await client.query(
      `SELECT to_regclass('migration_applied') IS NOT NULL AS present`,
    );
    if (table.rows[0]?.present) {
      const rows = await client.query<{ filename: string }>('SELECT filename FROM migration_applied');
      for (const row of rows.rows) already.add(row.filename);
    }

    for (const filename of readdirSync(migrations).filter((f) => f.endsWith('.sql')).sort()) {
      if (already.has(filename)) continue;
      const sql = readFileSync(join(migrations, filename), 'utf8');
      // Each migration is one transaction: it lands whole or not at all.
      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query('INSERT INTO migration_applied (filename) VALUES ($1)', [filename]);
        await client.query('COMMIT');
        applied.push(filename);
      } catch (error) {
        await client.query('ROLLBACK');
        throw new Error(`${filename}: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
      }
    }
    return applied;
  } finally {
    await client.end();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  // The owner, not the application.
  //
  // This read `ORBIT_DATABASE_URL`, which is the `orbit_app` role — the one
  // deliberately holding INSERT and SELECT and no DDL at all, because that is
  // what makes the immutable tables immutable. Migrations create tables, grant
  // privileges and revoke them, so running them as that role cannot work: the
  // one entrypoint a new developer reaches for failed on the first statement.
  // `.env.example` has said "Migrations run as the owner, separately" since it
  // was written; this is that, in code.
  //
  // A database may be named as an argument, so the test database is migrated
  // by the same command rather than by a second one that drifts from it.
  const url = process.argv[2]
    ?? process.env['ORBIT_OWNER_DATABASE_URL']
    ?? process.env['ORBIT_DATABASE_URL'];
  if (!url) throw new Error('Set ORBIT_OWNER_DATABASE_URL, or pass a connection string.');
  const applied = await migrate(url);
  console.log(applied.length ? `applied:\n  ${applied.join('\n  ')}` : 'nothing to apply');
}
