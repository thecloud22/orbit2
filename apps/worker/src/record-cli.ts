/**
 * Opens a browser, watches you do the job, and stores what you did as a draft.
 * Press Enter in this terminal when you are finished.
 */
import { createInterface } from 'node:readline/promises';
import { Pool } from 'pg';
import { record } from './record.ts';
import { originOf } from '@orbit/contract';

const pool = new Pool({ connectionString: process.env['ORBIT_OWNER_DATABASE_URL']
  ?? `postgres://${process.env['USER']}@localhost/orbit2_dev` });
const db = await pool.connect();
const { rows: [app] } = await db.query<{ host: string }>(
  `SELECT (r.addresses->0->>'host') AS host, (r.addresses->0->>'scheme') AS scheme FROM application_revision r ORDER BY r.revision DESC LIMIT 1`);

const rl = createInterface({ input: process.stdin, output: process.stdout });
console.log('A browser is opening. Do the job once, the way you normally would.');
console.log('Press Enter here when you are finished.\n');

const recording = await record({
  origin: originOf(app),
  startPath: '/pipeline',
  until: rl.question('').then(() => undefined),
  onStep: (s) => console.log(`  captured: ${s.kind.padEnd(9)} ${s.summary}`),
});
rl.close();

console.log(`\n  ${recording.touched} actions watched, ${recording.steps.length} steps captured`);
for (const q of recording.questions) console.log(`  · ${q}`);
db.release(); await pool.end();
