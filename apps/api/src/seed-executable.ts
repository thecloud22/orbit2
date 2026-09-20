/**
 * A version that can actually be run, and two queued runs of it.
 *
 * Every binding here is a strategy that would work on an application a
 * customer runs. Not one of them reads `data-testid`, although this portal is
 * covered in them — binding to a test id would make the binder look solved
 * while leaving every rung below it untested.
 *
 * The two runs differ only in their input: one loan number that exists and one
 * that does not. The second is the case acceptance criterion 7 is about, and
 * it must come out *succeeded*, with a conclusion of "no such file" and no
 * error at all.
 */
import { Client } from 'pg';
import { step, type Step } from '@orbit/contract';

const url = process.env['ORBIT_SEED_DATABASE_URL'] ?? `postgres://${process.env['USER']}@localhost/orbit2_dev`;
const id = () => crypto.randomUUID();
const s = { open: id(), enter: id(), activate: id(), look: id(), branch: id(), read: id(), found: id(), missing: id() };

const steps: Step[] = [
  { id: s.open, kind: 'open', summary: 'The underwriting pipeline', application: 'underwriting',
    path: '/pipeline', arrives: { describe: 'the pipeline is showing' }, changesARecord: false },

  { id: s.enter, kind: 'enter', summary: 'The loan number, into the search box', sensitive: false,
    value: { from: 'input', value: 'loanNumber' },
    // Named by its own <label>, which is what a page written for a person gives you.
    into: { label: 'Open a file by loan number',
            binding: { strategy: 'label', name: 'Open a file by loan number' } } },

  { id: s.activate, kind: 'activate', summary: 'Open file', changesARecord: false,
    then: { describe: 'the file, or a page saying there is none' },
    control: { label: 'Open file', binding: { strategy: 'roleAndName', role: 'button', name: 'Open file' } } },

  // Not required, so if the heading is not there the value is *absent* rather
  // than a failure — which is the whole of how "no such record" is expressed.
  { id: s.look, kind: 'read', summary: 'Did it say there is no such file?',
    region: { label: 'No file matches that loan number.',
              binding: { strategy: 'text', name: 'No file matches that loan number.' } },
    produces: { name: 'notFound', label: 'Not-found notice', type: 'text', required: false } },

  { id: s.branch, kind: 'branch', summary: 'Did a file come back?',
    when: { of: 'absence', operator: 'isAbsent', left: { from: 'step', value: 'notFound' } },
    ifTrue: s.read, ifFalse: s.missing },

  // A value in a div with no attribute of any kind, named only by the label
  // beside it. The rung an old page usually leaves you on.
  { id: s.read, kind: 'read', summary: 'The note rate',
    region: { label: 'Note rate', binding: { strategy: 'structural', name: 'Note rate' } },
    produces: { name: 'noteRate', label: 'Note rate', type: 'text', required: true } },

  { id: s.found, kind: 'end', summary: 'File found', outcome: 'fileFound', publishes: ['noteRate'] },
  { id: s.missing, kind: 'end', summary: 'No such file', outcome: 'noSuchFile', publishes: [] },
];

const client = new Client({ connectionString: url });
await client.connect();
await client.query('BEGIN');

const app = await client.query<{ id: string }>(
  `INSERT INTO application (name, surface) VALUES ('Underwriting', 'browser') RETURNING id`);
await client.query(
  `INSERT INTO application_revision (application_id, revision, addresses, sign_in_as, credential_name)
   VALUES ($1, 1, $2, 'underwriting_svc', 'UNDERWRITING_PW')`,
  [app.rows[0]!.id, JSON.stringify([{ host: 'localhost:4101', pathPrefix: '/' }])]);

const wf = await client.query<{ id: string }>(
  `INSERT INTO workflow (name, describe, procedure, confirmed_at)
   VALUES ('Note Rate Lookup', 'Opens a file by loan number and reports its note rate',
     'Open the underwriting pipeline. Search for the file using the loan number. If it is there, record the note rate. If there is no such file, say so — that happens a lot, it is not an error.',
     now()) RETURNING id`);

const version = await client.query<{ id: string }>(
  `INSERT INTO workflow_version (workflow_id, version, body, digest, outcomes, declared_inputs, applications, activated_at)
   VALUES ($1, 1, $2, $3, $4, $5, $6, now()) RETURNING id`,
  [wf.rows[0]!.id, JSON.stringify({ steps: steps.map((x) => step.parse(x)) }),
   'sha256:' + crypto.randomUUID().replaceAll('-', '').slice(0, 12),
   JSON.stringify([{ name: 'fileFound', label: 'File found' }, { name: 'noSuchFile', label: 'No such file' }]),
   JSON.stringify([{ name: 'loanNumber', label: 'Loan number', type: 'text', required: true }]),
   JSON.stringify([{ name: 'underwriting', revision: 1, addresses: [{ host: 'localhost:4101', pathPrefix: '/' }] }])]);

for (const [reference, loanNumber] of [['R-1001', 'ML-26-04471'], ['R-1002', 'ML-26-99999']]) {
  await client.query(
    `INSERT INTO run (version_id, reference, status, inputs) VALUES ($1, $2, 'queued', $3)`,
    [version.rows[0]!.id, reference, JSON.stringify({ loanNumber })]);
}

await client.query('COMMIT');
await client.end();
console.log(`queued R-1001 (ML-26-04471, exists) and R-1002 (ML-26-99999, does not)`);
