/**
 * Runs the resolution pass over a draft and prints what stopped it.
 * A person runs this; the product will run it from the publish screen.
 */
import { Client } from 'pg';
import { describeBlocker, step as stepSchema, type Step } from '@orbit/contract';
import { resolveEveryEnding } from './resolve.ts';

const url = process.env['ORBIT_OWNER_DATABASE_URL']
  ?? `postgres://${process.env['USER']}@localhost/orbit2_dev`;
const client = new Client({ connectionString: url });
await client.connect();

const { rows: [row] } = await client.query(
  `SELECT v.body, v.applications, w.name
     FROM workflow_version v JOIN workflow w ON w.id = v.workflow_id
    ORDER BY v.published_at DESC LIMIT 1`);
await client.end();

const steps: Step[] = (row.body.steps as unknown[]).map((s) => stepSchema.parse(s));
const origin = `http://${row.applications[0].addresses[0].host}`;
// The example values the author supplied when confirming, one per ending.
const examples = [
  { ending: 'fileFound', inputs: { loanNumber: 'ML-26-04471' } },
  { ending: 'noSuchFile', inputs: { loanNumber: 'ML-26-99999' } },
];

console.log(`Checking "${row.name}" against ${origin}\n`);
const reports = await resolveEveryEnding(steps, origin, examples);
const refused = reports.filter((r) => r.blockers.length > 0);

for (const r of reports) {
  const mark = r.blockers.length === 0 ? 'resolves' : 'refused';
  console.log(`  ${r.ending}: ${mark} \u2014 ${r.checked} of ${r.of} names checked`);
  for (const b of r.blockers) console.log(`      \u00b7 ${describeBlocker(b)}`);
}

console.log(refused.length === 0
  ? `\n  Every name resolves on every declared ending. Cleared to publish.`
  : `\n  Nothing was published. Fix those and check again.`);
process.exit(refused.length === 0 ? 0 : 1);
