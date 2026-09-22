/**
 * For tests: record that a workflow was brought in against an application, the
 * way every real draft is. Publication copies only that application into the
 * version, and refuses a draft whose application nobody recorded.
 */
import type { ClientBase } from 'pg';

export async function broughtInAgainst(db: ClientBase, workflowId: string, host = 'localhost:4101'): Promise<string> {
  const { rows: [a] } = await db.query<{ id: string }>(
    `INSERT INTO application (name, surface) VALUES ($1, 'browser') RETURNING id`,
    [`Fixture ${crypto.randomUUID().slice(0, 8)}`]);
  await db.query(
    `INSERT INTO application_revision (application_id, revision, addresses, sign_in_as, credential_name)
     VALUES ($1, 1, $2, 'svc', 'PW')`, [a!.id, JSON.stringify([{ host, pathPrefix: '/' }])]);
  await db.query(
    `INSERT INTO understanding (workflow_id, application_id, start_path) VALUES ($1, $2, '/')`, [workflowId, a!.id]);
  return a!.id;
}
