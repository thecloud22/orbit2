/** Confirms the newest draft, then publishes it. A person does both. */
import { Pool } from 'pg';
import { describeBlocker } from '@orbit/contract';
import { confirm } from './confirm.ts';
import { mintVersion } from './mint.ts';

const pool = new Pool({ connectionString: process.env['ORBIT_OWNER_DATABASE_URL']
  ?? `postgres://${process.env['USER']}@localhost/orbit2_dev` });
const db = await pool.connect();

const { rows: [w] } = await db.query<{ id: string; name: string }>(
  `SELECT id, name FROM workflow WHERE confirmed_at IS NULL ORDER BY created_at DESC LIMIT 1`);
if (!w) { console.log('nothing to confirm'); process.exit(0); }

const { rows: ends } = await db.query<{ id: string }>(
  `SELECT id FROM workflow_step WHERE workflow_id = $1 AND kind = 'end' ORDER BY position`, [w.id]);
const { rows: notes } = await db.query<{ id: string }>(
  `SELECT id FROM workflow_note WHERE workflow_id = $1 AND resolved_at IS NULL`, [w.id]);

console.log(`Confirming "${w.name}"\n`);
const confirmed = await confirm(db as never, w.id, {
  endings: [{ stepId: ends[0]!.id, outcome: 'noteRateRecorded', label: 'Note rate recorded',
              example: { loanNumber: 'ML-26-04471' } }],
  answers: notes.map((n) => ({ noteId: n.id })),
  attested: true,
});

if (confirmed.outcome === 'refused') {
  for (const b of confirmed.blockers) console.log(`  · ${describeBlocker(b)}`);
  process.exit(1);
}
console.log(`  Confirmed. ${confirmed.outcomes} ending declared, with an example.\n`);

const published = await mintVersion(db as never, w.id);
if (published.outcome === 'published') {
  console.log(`Published version ${published.version}`);
  console.log(`  ${published.digest}`);
} else {
  console.log(`Publication refused:\n`);
  for (const b of published.blockers) console.log(`  · ${describeBlocker(b)}`);
}
db.release(); await pool.end();
