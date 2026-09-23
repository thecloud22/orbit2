/**
 * An agent across applications, and what a green screen needs from the API
 * (Orbit 2.2, C3–C4, C11, C14–C15). What is proved: a green screen is
 * registered as tn3270 with its settings, and a web address cannot be one; an
 * application is attached to an agent once, and a sentence is placed on an
 * application the agent works on, which leaves it waiting to be mapped;
 * publication carries every application, first the one the agent was
 * brought in against, and refuses one no worker can drive; and a run that
 * stopped part-way is not retried or run again blind.
 */
import { strict as assert } from 'node:assert';
import { after, before, test } from 'node:test';
import { Client } from 'pg';
import { migrate } from './migrate.ts';
import { registerApplication } from './applications.ts';
import { bringInToUnderstand } from './understanding.ts';
import { attachApplication, pendingOf, placeSentence } from './revise.ts';
import { checkRun, rerun, retryRun } from './control.ts';

const owner = process.env['ORBIT_TEST_DATABASE_URL'] ?? `postgres://${process.env['USER']}@localhost/orbit2_test`;
let db: Client;
const tag = () => crypto.randomUUID().slice(0, 6);

before(async () => { await migrate(owner); db = new Client({ connectionString: owner }); await db.connect(); });
after(async () => { await db?.end(); });

async function register(surface: 'browser' | 'terminal', host: string, extra: Record<string, unknown> = {}) {
  return registerApplication(db as never, { name: `${surface} ${tag()}`, surface, addresses: [{ host }], signInAs: 'admin', ...extra });
}

test('a green screen is registered over tn3270 with its settings, and a web address cannot be one', async () => {
  const green = await register('terminal', 'tn3270://localhost:3271', { terminal: { codePage: 'cp037', model: '3278-2' } });
  assert.equal(green.ok, true);
  const { rows: [r] } = await db.query(`SELECT addresses, terminal FROM application_revision WHERE application_id = $1`, [green.ok && green.id]);
  assert.equal(r.addresses[0].scheme, 'tn3270');
  assert.deepEqual(r.terminal, { codePage: 'cp037', model: '3278-2' });
  const refused = await register('terminal', 'localhost:3271');
  assert.equal(refused.ok, false);
  const web = await register('browser', 'localhost:4101');
  const { rows: [w] } = await db.query(`SELECT terminal FROM application_revision WHERE application_id = $1`, [web.ok && web.id]);
  assert.equal(w.terminal, null, 'a web application carries no terminal settings');
});

async function agentAcross() {
  const web = await register('browser', 'localhost:4101');
  const green = await register('terminal', 'tn3270://localhost:3271');
  assert.ok(web.ok && green.ok);
  const brought = await bringInToUnderstand(db as never, { name: 'Boarding', applicationId: web.id, startPath: '/login', inputs: {},
    procedure: 'Open the loan file. Board the loan on Loan Servicing. Save the account on the file.' });
  assert.ok(brought.ok);
  const W = brought.id;
  for (const n of [1, 2, 3]) {
    await db.query(`INSERT INTO sentence_label (sentence_id, label, reason, basis, given_by)
      SELECT s.id, 'task', 'r', 'stated', 'model' FROM procedure_sentence s JOIN procedure_part p ON p.id = s.part_id
       WHERE p.workflow_id = $1 AND s.n = $2`, [W, n]);
  }
  await db.query(`UPDATE understanding SET status = 'sorted' WHERE workflow_id = $1`, [W]);
  return { W, web: web.id, green: green.id };
}

test('an application is attached once, and a sentence is placed on one the agent works on', async () => {
  const { W, web, green } = await agentAcross();
  assert.deepEqual(await attachApplication(db as never, W, { applicationId: green }), { ok: true });
  assert.equal((await attachApplication(db as never, W, { applicationId: green })).ok, false, 'not twice');
  assert.equal((await attachApplication(db as never, W, { applicationId: web })).ok, false, 'the first is already its own');
  const { rows: [u] } = await db.query(`SELECT status FROM understanding WHERE workflow_id = $1`, [W]);
  assert.equal(u.status, 'queued', 'the sort places each line on an application');

  await db.query(`UPDATE understanding SET status = 'sorted' WHERE workflow_id = $1`, [W]);
  const other = await register('browser', 'localhost:4999');
  assert.ok(other.ok);
  assert.equal((await placeSentence(db as never, W, { sentence: '1.2', applicationId: other.id })).ok, false, 'not an application it works on');
  assert.deepEqual(await placeSentence(db as never, W, { sentence: '1.2', applicationId: green }), { ok: true });
  const { rows: [placed] } = await db.query(`SELECT t.given_by FROM sentence_application t JOIN procedure_sentence s ON s.id = t.sentence_id
    JOIN procedure_part p ON p.id = s.part_id WHERE p.workflow_id = $1 AND s.n = 2`, [W]);
  assert.equal(placed.given_by, 'author');
});

test('a sentence moved to another application waits to be mapped', async () => {
  const { W, green } = await agentAcross();
  await attachApplication(db as never, W, { applicationId: green });
  await db.query(`UPDATE understanding SET status = 'sorted' WHERE workflow_id = $1`, [W]);
  const { rows: [s] } = await db.query<{ id: string }>(
    `INSERT INTO authoring_session (name, procedure, application_id, start_path, into_workflow_id, status, workflow_id, ended_at)
     SELECT 'x', 'x', application_id, '/', $1, 'brought in', $1, now() FROM understanding WHERE workflow_id = $1 RETURNING id`, [W]);
  await db.query(`INSERT INTO mapping (workflow_id, session_id, mapped_at) VALUES ($1, $2, clock_timestamp())`, [W, s!.id]);
  assert.deepEqual(await pendingOf(db, W), []);
  await placeSentence(db as never, W, { sentence: '1.2', applicationId: green });
  assert.deepEqual(await pendingOf(db, W), ['1.2']);
});

async function failedPartWay(partial: Record<string, unknown>, kind = 'timedOut') {
  const { rows: [w] } = await db.query<{ id: string }>(`INSERT INTO workflow (name, outcomes) VALUES ('Part-way', '[]') RETURNING id`);
  const { rows: [v] } = await db.query<{ id: string }>(
    `INSERT INTO workflow_version (workflow_id, version, body, digest, outcomes, declared_inputs, applications)
     VALUES ($1, 1, '{"steps":[]}', $2, '[]', '[]', '[]') RETURNING id`, [w!.id, 'sha256:' + crypto.randomUUID().replaceAll('-', '')]);
  const reference = tag().toUpperCase();
  await db.query(`INSERT INTO run (version_id, reference, status, inputs, error) VALUES ($1, $2, 'failed', '{}', $3)`,
    [v!.id, reference, JSON.stringify({ kind, step: 4, describe: 'The application did not answer', partial })]);
  return reference;
}

test('a press never answered holds retry and re-run until a person has checked', async () => {
  const ref = await failedPartWay({ changed: [{ application: 'Web', step: 2, control: 'Approve' }],
    unknown: { application: 'Loan Servicing', step: 4, control: 'SUBMIT' } });
  const retried = await retryRun(db as never, ref);
  assert.equal(retried.ok, false);
  assert.match(retried.ok ? '' : retried.because, /SUBMIT was pressed on Loan Servicing and never answered/);
  assert.equal((await rerun(db as never, ref)).ok, false);
  assert.deepEqual(await checkRun(db as never, ref), { ok: true, reference: ref });
  assert.equal((await checkRun(db as never, ref)).ok, false, 'checked once');
  assert.equal((await retryRun(db as never, ref)).ok, true, 'a person looked; it may run again');
});

test('a run that changed something before it stopped is not retried blind, but may be run afresh', async () => {
  const ref = await failedPartWay({ changed: [{ application: 'Web', step: 2, control: 'Approve' }] });
  assert.equal((await retryRun(db as never, ref)).ok, false, 'a retry would press Approve again');
  assert.equal((await rerun(db as never, ref)).ok, true, 'a fresh run is a person\'s explicit choice, with what changed on the page');
});
