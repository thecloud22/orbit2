/**
 * One run, end to end, so the whole thread can be looked at: a registered
 * application, a workflow, a published version, a run of it, its attempts, its
 * events and its evidence.
 *
 * The values are from the practice portals in `apps/`, not from any business —
 * a ticket reference and a queue, because the product is domain-neutral and
 * the schema must never learn a domain.
 */
import { Client } from 'pg';
import { step, type Step } from '@orbit/contract';

const url = process.env['ORBIT_SEED_DATABASE_URL']
  ?? `postgres://${process.env['USER']}@localhost/orbit2_dev`;

const uuid = () => crypto.randomUUID();
const ids = { open: uuid(), enter: uuid(), activate: uuid(), branch: uuid(), readStatus: uuid(), readQueue: uuid(), end: uuid() };

/** Validated by the contract before it is stored, like anything crossing a boundary. */
const steps: Step[] = [
  { id: ids.open, kind: 'open', summary: 'Service desk search', application: 'serviceDesk',
    path: '/search', arrives: { describe: 'the search form is showing' }, changesARecord: false },
  { id: ids.enter, kind: 'enter', summary: 'The reference, into Reference',
    into: { label: 'Reference', binding: null }, value: { from: 'input', value: 'reference' }, sensitive: false },
  { id: ids.activate, kind: 'activate', summary: 'Search', control: { label: 'Search', binding: null },
    then: { describe: 'a result or an empty list' }, changesARecord: false },
  { id: ids.branch, kind: 'branch', summary: 'Did a ticket come back?',
    when: { of: 'listOfRows', operator: 'hasRows', left: { from: 'step', value: 'results' } },
    ifTrue: ids.readStatus, ifFalse: ids.end },
  { id: ids.readStatus, kind: 'read', summary: 'Status, into status',
    region: { label: 'Status', binding: null },
    produces: { name: 'status', label: 'Status', type: 'text', required: false } },
  { id: ids.readQueue, kind: 'read', summary: 'Queue, into queue',
    region: { label: 'Assigned queue', binding: null },
    produces: { name: 'queue', label: 'Assigned queue', type: 'text', required: false } },
  { id: ids.end, kind: 'end', summary: 'Ticket found', outcome: 'ticketFound', publishes: ['status', 'queue'] },
];

const client = new Client({ connectionString: url });
await client.connect();
await client.query('BEGIN');

const app = await client.query<{ id: string }>(
  `INSERT INTO application (name, surface) VALUES ('Service Desk', 'browser') RETURNING id`);
await client.query(
  `INSERT INTO application_revision (application_id, revision, addresses, sign_in_as, credential_name, formats)
   VALUES ($1, 7, $2, 'desk_svc', 'SERVICE_DESK_PW', $3)`,
  [app.rows[0]!.id,
   JSON.stringify([{ host: 'localhost:4101', pathPrefix: '/' }]),
   JSON.stringify({ date: 'MMM d, yyyy', thousands: ',', decimal: '.' })]);

const wf = await client.query<{ id: string }>(
  `INSERT INTO workflow (name, describe, procedure, confirmed_at)
   VALUES ('Ticket Status Lookup', 'Looks up a ticket and reports its status and queue',
           'Search for the ticket using the reference the requester gave us. If it is there, record the status and the assigned queue. If there is no such ticket, say so — that happens a lot, it is not an error.',
           now()) RETURNING id`);
const workflowId = wf.rows[0]!.id;

const body = { steps: steps.map((s) => step.parse(s)) };
const version = await client.query<{ id: string }>(
  `INSERT INTO workflow_version (workflow_id, version, body, digest, outcomes, declared_inputs, applications)
   VALUES ($1, 3, $2, 'sha256:4c9a17e0b3d5', $3, $4, $5) RETURNING id`,
  [workflowId, JSON.stringify(body),
   JSON.stringify([
     { name: 'ticketFound', label: 'Ticket found' },
     { name: 'noSuchTicket', label: 'No such ticket' },
     { name: 'ticketClosed', label: 'Ticket closed, sent to a person' }]),
   JSON.stringify([{ name: 'reference', label: 'Reference', type: 'text', required: true }]),
   JSON.stringify([{ name: 'serviceDesk', revision: 7, addresses: [{ host: 'localhost:4101', pathPrefix: '/' }] }])]);
const versionId = version.rows[0]!.id;

// Live is a pointer the workflow holds, so seeding an active workflow means
// pointing it, not stamping the version.
await client.query(`UPDATE workflow SET live_version_id = $1 WHERE id = $2`, [versionId, workflowId]);

const run = await client.query<{ id: string }>(
  `INSERT INTO run (version_id, reference, status, outcome, inputs, outputs, started_at, ended_at)
   VALUES ($1, '8F42C1', 'succeeded', 'ticketFound', $2, $3, now() - interval '12 seconds') RETURNING id`,
  [versionId, JSON.stringify({ reference: 'SR-4417' }),
   JSON.stringify({ status: 'Open', queue: 'Infrastructure Operations' })]);
const runId = run.rows[0]!.id;

const durations = [1900, 400, 3800, 100, 300, 300, 0];
for (const [i, s] of steps.entries()) {
  const attempt = await client.query<{ id: string }>(
    `INSERT INTO step_attempt (run_id, step_position, step_kind, attempt, outcome, ended_at)
     VALUES ($1, $2, $3, 1, 'ok') RETURNING id`, [runId, i + 1, s.kind]);
  const attemptId = attempt.rows[0]!.id;
  await client.query(
    `INSERT INTO run_event (run_id, attempt_id, kind, detail) VALUES
       ($1, $2, 'step.attempt.started', $3),
       ($1, $2, 'step.attempt.ended', $4)`,
    [runId, attemptId, JSON.stringify({ attempt: 1 }),
     JSON.stringify({ outcome: 'ok', tookMs: durations[i] })]);
  if (s.kind === 'branch') {
    await client.query(
      `INSERT INTO run_event (run_id, attempt_id, kind, detail) VALUES ($1, $2, 'branch.evaluated', $3)`,
      [runId, attemptId, JSON.stringify({ left: 1, operator: 'hasRows', right: 1, tookPath: 'ticket exists' })]);
  }
  if (s.kind !== 'end' && s.kind !== 'branch') {
    await client.query(
      `INSERT INTO artefact (run_id, attempt_id, kind, media_type, bytes, digest)
       VALUES ($1, $2, 'screenshot', 'image/png', $3, $4)`,
      [runId, attemptId, 180_000 + i * 9_000, `sha256:${crypto.randomUUID().replaceAll('-', '').slice(0, 12)}`]);
  }
}

await client.query(
  `INSERT INTO artefact (run_id, kind, media_type, bytes, digest)
   VALUES ($1, 'trace', 'application/json', 2_400_000, 'sha256:9f2c7d10aa41')`, [runId]);
await client.query(
  `INSERT INTO artefact (run_id, kind, withheld, withheld_why)
   VALUES ($1, 'screenshot', true, 'a secret was entered into a field Orbit could not confirm was masked')`, [runId]);

for (const [act, kind, id] of [
  ['procedure confirmed', 'workflow', workflowId],
  ['version published', 'workflow_version', versionId],
  ['version activated', 'workflow_version', versionId],
  ['run started', 'run', runId],
] as const) {
  await client.query(
    `INSERT INTO audit_entry (act, object_kind, object_id, changed) VALUES ($1, $2, $3, '{}')`, [act, kind, id]);
}

await client.query('COMMIT');
await client.end();
console.log(`seeded run 8F42C1 — ${steps.length} steps, version 3`);
