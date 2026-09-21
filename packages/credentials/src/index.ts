/**
 * How a credential's value is encrypted, and how it is read back.
 *
 * Two processes need this and they must agree exactly: the API writes a value
 * when somebody registers an application, and the worker reads it at the
 * moment of a run's sign-in. It is a package rather than a file in one of
 * them because the same arrangement — one copy in `apps/api`, another in
 * `apps/worker` — is what produced the evidence store that the worker wrote
 * to and the API could not read from. Two implementations of one format drift
 * silently, and the symptom appears only at run time.
 *
 * What Decision 5 item 5 protects holds wherever the value arrived from: it
 * is encrypted before it is written, the key is not in the database
 * (`ORBIT_CREDENTIAL_KEY`, an environment variable — a backup of the store on
 * its own decrypts nothing), and no read anywhere selects `secret_enc` except
 * the one below.
 *
 * `key_id` names the scheme version, not a key itself, so rotating how a
 * value is encrypted (a managed key service, in production) does not silently
 * break something encrypted under the scheme before it.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

export const KEY_ID = 'env:ORBIT_CREDENTIAL_KEY:aes-256-gcm:v1';

function key(): Buffer {
  const secret = process.env['ORBIT_CREDENTIAL_KEY'];
  if (!secret) throw new Error('ORBIT_CREDENTIAL_KEY is not set — a credential value cannot be encrypted without it.');
  // Hashed rather than used verbatim, so the env var is not required to be
  // exactly 32 bytes of key material — a passphrase works as well as a key.
  return createHash('sha256').update(secret).digest();
}

export function encrypt(plaintext: string): Buffer {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const body = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), body]);
}

export function decrypt(secretEnc: Buffer): string {
  const iv = secretEnc.subarray(0, 12);
  const authTag = secretEnc.subarray(12, 28);
  const body = secretEnc.subarray(28);
  const decipher = createDecipheriv('aes-256-gcm', key(), iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(body), decipher.final()]).toString('utf8');
}

/** The one query anywhere that selects `secret_enc`. */
export async function readCredential(
  db: { query: (sql: string, values: unknown[]) => Promise<{ rows: Array<{ secret_enc: Buffer }> }> },
  name: string,
): Promise<string | null> {
  const { rows: [row] } = await db.query(`SELECT secret_enc FROM credential WHERE name = $1`, [name]);
  return row ? decrypt(row.secret_enc) : null;
}
