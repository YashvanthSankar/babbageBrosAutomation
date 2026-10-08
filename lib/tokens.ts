/**
 * Secure server-side storage for the professor's Google refresh token.
 *
 * The refresh token is AES-256-GCM encrypted before it touches the database and
 * is NEVER placed in the NextAuth JWT or returned to a client. The key is
 * derived from TOKEN_ENCRYPTION_KEY (preferred) or NEXTAUTH_SECRET.
 */
import crypto from 'node:crypto';
import { query } from './db';
import { normalizeEmail } from './env';

export interface StoredTokenData {
  refreshToken: string | null;
  accessToken: string | null;
  scope: string | null;
  tokenType: string | null;
  expiresAt: string | null;
}

function encryptionKey(): Buffer {
  const secret = process.env.TOKEN_ENCRYPTION_KEY || process.env.NEXTAUTH_SECRET;
  if (!secret) {
    throw new Error(
      'Cannot encrypt OAuth tokens: set TOKEN_ENCRYPTION_KEY or NEXTAUTH_SECRET.',
    );
  }
  return crypto.createHash('sha256').update(secret, 'utf8').digest();
}

function encrypt(plaintext: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString('base64'), tag.toString('base64'), ciphertext.toString('base64')].join('.');
}

function decrypt(payload: string): string {
  const [ivPart, tagPart, dataPart] = payload.split('.');
  if (!ivPart || !tagPart || !dataPart) throw new Error('Malformed encrypted token payload.');
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    encryptionKey(),
    Buffer.from(ivPart, 'base64'),
  );
  decipher.setAuthTag(Buffer.from(tagPart, 'base64'));
  return Buffer.concat([
    decipher.update(Buffer.from(dataPart, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}

export async function saveProfessorToken(
  email: string,
  data: StoredTokenData,
): Promise<void> {
  const existing = await getProfessorTokenData(email);
  // Google only returns refresh_token on the first consent (or with prompt=consent).
  // Never clobber a good refresh token with null.
  const refreshToken = data.refreshToken ?? existing?.refreshToken ?? null;
  const blob = encrypt(JSON.stringify({ ...data, refreshToken }));
  await query(
    `INSERT INTO oauth_tokens (email, provider, refresh_token_encrypted, scope, token_type, expires_at, updated_at)
          VALUES ($1, 'google', $2, $3, $4, $5, now())
     ON CONFLICT (email, provider)
       DO UPDATE SET refresh_token_encrypted = EXCLUDED.refresh_token_encrypted,
                     scope = EXCLUDED.scope,
                     token_type = EXCLUDED.token_type,
                     expires_at = EXCLUDED.expires_at,
                     updated_at = now()`,
    [normalizeEmail(email), blob, data.scope, data.tokenType, data.expiresAt],
  );
}

export async function getProfessorTokenData(email: string): Promise<StoredTokenData | null> {
  const result = await query<{ refresh_token_encrypted: string }>(
    `SELECT refresh_token_encrypted
       FROM oauth_tokens
      WHERE email = $1 AND provider = 'google'
      LIMIT 1`,
    [normalizeEmail(email)],
  );
  const row = result.rows[0];
  if (!row) return null;
  try {
    return JSON.parse(decrypt(row.refresh_token_encrypted)) as StoredTokenData;
  } catch (error) {
    console.error('[tokens] failed to decrypt stored professor token', error);
    return null;
  }
}

/** True only when a usable refresh token exists for this professor. */
export async function hasProfessorRefreshToken(email: string): Promise<boolean> {
  try {
    const data = await getProfessorTokenData(email);
    return Boolean(data?.refreshToken);
  } catch {
    return false;
  }
}
