import { Pool } from 'pg';
import { describeBlocker } from '@orbit/contract';
import { mintVersion } from './mint.ts';

const pool = new Pool({ connectionString: process.env['ORBIT_OWNER_DATABASE_URL']
  ?? `postgres://${process.env['USER']}@localhost/orbit2_dev` });
const db = await pool.connect();
const { rows: [w] } = await db.query<{ id: string; name: string }>(
  `SELECT id, name FROM workflow ORDER BY created_at DESC LIMIT 1`);

console.log(`Publishing "${w!.name}"\n`);
const result = await mintVersion(db as never, w!.id);
if (result.outcome === 'published') {
  console.log(`  Version ${result.version} minted.`);
  console.log(`  ${result.digest}`);
} else {
  console.log(`  Refused. ${result.blockers.length} thing${result.blockers.length === 1 ? '' : 's'} stop it:\n`);
  for (const b of result.blockers) console.log(`  · ${describeBlocker(b)}`);
  console.log(`\n  Nothing was minted.`);
}
db.release(); await pool.end();
