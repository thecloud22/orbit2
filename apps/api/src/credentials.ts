/**
 * Setting a credential's value.
 *
 * Amends Decision 5 item 5 (see migration 0014): the value now crosses the
 * product's own API rather than only an out-of-band channel. What the
 * original decision protects stays true regardless of how the value arrived:
 * it is encrypted before it is written, the key that encrypts it is not in
 * the database (`ORBIT_CREDENTIAL_KEY`, an environment variable — a backup of
 * the store on its own decrypts nothing), and no read anywhere selects
 * `secret_enc` (see admin.ts's own comment on that).
 *
 * `key_id` names the scheme version, not a key itself, so rotating how a
 * value is encrypted (a managed key service, in production) does not
 * silently break something encrypted under the scheme before it.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import type { PoolClient } from 'pg';

const KEY_ID = 'env:ORBIT_CREDENTIAL_KEY:aes-256-gcm:v1';

function key(): Buffer {
  const secret = process.env['ORBIT_CREDENTIAL_KEY'];
  if (!secret) throw new Error('ORBIT_CREDENTIAL_KEY is not set — a credential value cannot be encrypted without it.');
  // Hashed rather than used verbatim, so the env var is not required to be
  // exactly 32 bytes of key material — a passphrase works as well as a key.
  return createHash('sha256').update(secret).digest();
}

function encrypt(plaintext: string): Buffer {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const body = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]);
}

/** Not used by the product today — the worker will use this at the moment of
 *  a run's sign-in, and nowhere else (Decision 5 item 5). Kept beside
 *  `encrypt` so the format the two must agree on is defined in one place. */
export function decrypt(secretEnc: Buffer): string {
  const iv = secretEnc.subarray(0, 12);
  const authTag = secretEnc.subarray(12, 28);
  const body = secretEnc.subarray(28);
  const decipher = createDecipheriv('aes-256-gcm', key(), iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(body), decipher.final()]).toString('utf8');
}

/** Files a value under a name. Replaces whatever was filed under it before —
 *  rotation writes a new value without reading the old (§8). */
export async function setCredential(db: PoolClient, name: string, value: string): Promise<void> {
  await db.query(
    `INSERT INTO credential (name, secret_enc, key_id, rotated_at) VALUES ($1, $2, $3, now())
     ON CONFLICT (name) DO UPDATE SET secret_enc = $2, key_id = $3, rotated_at = now()`,
    [name, encrypt(value), KEY_ID]);
}
