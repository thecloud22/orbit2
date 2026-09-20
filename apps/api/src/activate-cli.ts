/** Queues a test per unproved ending, then tries to activate. */
import { Pool } from 'pg';
import { activate, queueTests, testCases } from './activate.ts';

const pool = new Pool({ connectionString: process.env['ORBIT_OWNER_DATABASE_URL']
  ?? `postgres://${process.env['USER']}@localhost/orbit2_dev` });
const db = await pool.connect();
const { rows: [v] } = await db.query<{ id: string; version: number }>(
  `SELECT id, version FROM workflow_version ORDER BY published_at DESC LIMIT 1`);

if (process.argv.includes('--queue')) {
  const queued = await queueTests(db as never, v!.id);
  console.log(queued.length ? `queued ${queued.join(', ')}` : 'every ending is already proved');
} else {
  console.log(`Version ${v!.version}\n`);
  for (const c of await testCases(db as never, v!.id)) {
    console.log(`  ${c.provedBy ? '✓' : '·'} ${c.label.padEnd(24)} ${
      c.provedBy ? `proved by ${c.provedBy.reference}` : 'not run yet'}`);
  }
  const result = await activate(db as never, v!.id);
  console.log(result.outcome === 'activated'
    ? `\n  Activated. Operators can start runs of version ${result.version}.`
    : `\n  Not activated. ${result.unproved.length} ending${result.unproved.length === 1 ? '' : 's'} unproved: ${result.unproved.join(', ')}`);
}
db.release(); await pool.end();
