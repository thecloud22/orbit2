/**
 * Brings a procedure in, and stores it. The product will do this from a screen.
 *
 *   author-cli "<name>" "<the procedure, as written>" [input=value ...]
 *
 * The procedure is an argument rather than a constant because the point of
 * this tool is to try a procedure nobody has tried, and a tool that can only
 * bring in the one it was written with cannot do that.
 */
import { Pool } from 'pg';
import { modelFromEnvironment } from '@orbit/model';
import { authorAndStore } from './author-store.ts';
import { originOf } from '@orbit/contract';

const pool = new Pool({ connectionString: process.env['ORBIT_OWNER_DATABASE_URL']
  ?? `postgres://${process.env['USER']}@localhost/orbit2_dev` });
const db = await pool.connect();

const { rows: [app] } = await db.query<{ id: string; host: string }>(
  `SELECT a.id, (r.addresses->0->>'host') AS host, (r.addresses->0->>'scheme') AS scheme
     FROM application a JOIN application_revision r ON r.application_id = a.id
    ORDER BY r.revision DESC LIMIT 1`);

const [name, procedure, ...given] = process.argv.slice(2);
if (!name || !procedure) {
  console.error('author-cli "<name>" "<the procedure>" [input=value ...]');
  process.exit(2);
}

// The inputs are the example values the walk is done with. They are not part
// of the workflow: what the procedure declares is the input's *name*, and the
// value here only decides which file the authoring session happens to look at.
const inputs = Object.fromEntries(given.map((pair) => {
  const at = pair.indexOf('=');
  return [pair.slice(0, at), pair.slice(at + 1)];
}));

const result = await authorAndStore(db, {
  name, procedure,
  applicationId: app!.id,
  origin: originOf(app),
  startPath: '/pipeline',
  inputs,
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
