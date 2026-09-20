/**
 * Decision 3 says a published version is immutable "in fact, not by
 * convention". These tests are what makes that sentence checkable: they assert
 * the *failure* of an UPDATE, rather than the absence of code that would issue
 * one. Application discipline is not evidence to a reader who was not present,
 * and §12 is written for exactly that reader.
 */
import { strict as assert } from 'node:assert';
import { after, before, describe, test } from 'node:test';
import { Client } from 'pg';
import { migrate } from './migrate.ts';

const owner = process.env['ORBIT_TEST_DATABASE_URL']
  ?? `postgres://${process.env['USER']}@localhost/orbit2_test`;
const asApp = owner.replace(/\/\/[^@]*@/, '//orbit_app:orbit_app_local_only@');

let app: Client;
let asOwner: Client;
let versionId: string;
let workflowId: string;

/**
 * Each with a column it actually has. An UPDATE naming a column that does not
 * exist fails at parse time, before the privilege check — which would look like
 * a pass while proving nothing.
 */
const IMMUTABLE = [
  ['workflow_version', 'digest'],
  ['audit_entry', 'act'],
  ['run_event', 'kind'],
  ['artefact', 'kind'],
  ['model_call', 'verdict'],
] as const;

before(async () => {
  await migrate(owner);
  asOwner = new Client({ connectionString: owner });
  await asOwner.connect();
  await asOwner.query('GRANT CONNECT ON DATABASE orbit2_test TO orbit_app');
  await asOwner.query('GRANT USAGE ON SCHEMA public TO orbit_app');

  app = new Client({ connectionString: asApp });
  await app.connect();

  const wf = await app.query<{ id: string }>(
    `INSERT INTO workflow (name) VALUES ('Ticket status lookup') RETURNING id`);
  workflowId = wf.rows[0]!.id;
  const version = await app.query<{ id: string }>(
    `INSERT INTO workflow_version (workflow_id, version, body, digest, outcomes, declared_inputs, applications)
     VALUES ($1, 1, '{"steps":[]}', 'sha256:4c9a17e0', '[]', '[]', '[]') RETURNING id`, [workflowId]);
  versionId = version.rows[0]!.id;
});

after(async () => { await app?.end(); await asOwner?.end(); });

describe('a published version is immutable in fact', () => {
  test('the application may write one', () => {
    assert.ok(versionId, 'publication mints a version');
  });

  for (const [table, column] of IMMUTABLE) {
    test(`the application cannot UPDATE ${table}`, async () => {
      await assert.rejects(
        () => app.query(`UPDATE ${table} SET ${column} = 'tampered'`),
        (error: Error & { code?: string }) =>
          error.code === '42501' || error.message.includes('append-only'),
        `${table} must refuse an update from the application role`,
      );
    });

    test(`the application cannot DELETE from ${table}`, async () => {
      await assert.rejects(
        () => app.query(`DELETE FROM ${table}`),
        (error: Error & { code?: string }) =>
          error.code === '42501' || error.message.includes('append-only'),
      );
    });
  }

  test('even the owner is refused, because the trigger is the second lock', async () => {
    // A revoked privilege can be re-granted by whoever holds the database.
    // The trigger is what still refuses after that, which is why both exist.
    await assert.rejects(
      () => asOwner.query(`UPDATE workflow_version SET digest = 'tampered'`),
      (error: Error) => error.message.includes('append-only'),
    );
  });

  test('editing the workflow does not change the version it published', async () => {
    // Acceptance criterion 5, as a query rather than a promise.
    const before = await app.query<{ digest: string }>(
      'SELECT digest FROM workflow_version WHERE id = $1', [versionId]);
    await app.query(`UPDATE workflow SET procedure = 'rewritten entirely' WHERE id = $1`, [workflowId]);
    const after = await app.query<{ digest: string }>(
      'SELECT digest FROM workflow_version WHERE id = $1', [versionId]);
    assert.equal(after.rows[0]!.digest, before.rows[0]!.digest);
  });
});

describe('a withheld artefact is a record, not an absence', () => {
  test('withheld demands a reason and carries no digest', async () => {
    const run = await app.query<{ id: string }>(
      `INSERT INTO run (version_id, reference, status, inputs)
       VALUES ($1, 'T-' || substr(gen_random_uuid()::text, 1, 6), 'running', '{}') RETURNING id`, [versionId]);
    const runId = run.rows[0]!.id;

    await assert.rejects(
      () => app.query(
        `INSERT INTO artefact (run_id, kind, withheld) VALUES ($1, 'screenshot', true)`, [runId]),
      /violates check constraint/,
      'a withheld artefact without a reason is not a record of anything',
    );

    await app.query(
      `INSERT INTO artefact (run_id, kind, withheld, withheld_why)
       VALUES ($1, 'screenshot', true, 'a secret was entered into a field that could not be confirmed masked')`,
      [runId]);
  });
});
