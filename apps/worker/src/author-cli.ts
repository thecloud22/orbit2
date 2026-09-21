/** Brings a procedure in, and stores it. The product will do this from a screen. */
import { Pool } from 'pg';
import { modelFromEnvironment } from '@orbit/model';
import { authorAndStore } from './author-store.ts';

const pool = new Pool({ connectionString: process.env['ORBIT_OWNER_DATABASE_URL']
  ?? `postgres://${process.env['USER']}@localhost/orbit2_dev` });
const db = await pool.connect();

const { rows: [app] } = await db.query<{ id: string; host: string }>(
  `SELECT a.id, (r.addresses->0->>'host') AS host
     FROM application a JOIN application_revision r ON r.application_id = a.id
    ORDER BY r.revision DESC LIMIT 1`);

const result = await authorAndStore(db, {
  name: 'Note Rate Lookup, brought in',
  procedure: 'Open the underwriting pipeline and search for the file using the loan number the requester gave us. '
    + 'If the file is there, record the note rate. If there is no such file, say so — that happens a lot, it is not an error.',
  applicationId: app!.id,
  origin: `http://${app!.host}`,
  startPath: '/pipeline',
  inputs: { loanNumber: 'ML-26-04471' },
  model: modelFromEnvironment(),
});

db.release(); await pool.end();

if (result.stored === false) {
  // Nothing was written. Saying which step and what was wrong is the "and says
  // so" half of criterion 2 — a refusal that does not say why leaves the
  // author with the same text and no idea what to change.
  console.error(result.describe);
  console.error(`  ${result.turns.length} turns were made and could not be kept.`);
  process.exit(1);
}

console.log(`workflow ${result.workflowId}`);
console.log(`  ${result.draft.steps.length} steps, ${result.draft.turns.length} turns stored`);
