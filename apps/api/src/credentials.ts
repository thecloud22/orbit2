/**
 * Setting a credential's value.
 *
 * Amends Decision 5 item 5 (see migration 0014): the value now crosses the
 * product's own API rather than only an out-of-band channel.
 *
 * How it is encrypted lives in `@orbit/credentials`, because the worker reads
 * these back at the moment of a run's sign-in and two implementations of one
 * format drift silently. `decrypt` is re-exported so the tests that prove a
 * value round-trips keep importing it from beside the writer.
 */
import type { PoolClient } from 'pg';
import { encrypt, KEY_ID } from '@orbit/credentials';

export { decrypt } from '@orbit/credentials';

/** Files a value under a name. Replaces whatever was filed under it before —
 *  rotation writes a new value without reading the old (§8). */
export async function setCredential(db: PoolClient, name: string, value: string): Promise<void> {
  await db.query(
    `INSERT INTO credential (name, secret_enc, key_id, rotated_at) VALUES ($1, $2, $3, now())
     ON CONFLICT (name) DO UPDATE SET secret_enc = $2, key_id = $3, rotated_at = now()`,
    [name, encrypt(value), KEY_ID]);
}
