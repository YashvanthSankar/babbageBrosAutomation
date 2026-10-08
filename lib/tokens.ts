import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { integrationMutation, integrationQuery } from './integrations-store';

function key(): Buffer {
  const secret = process.env.TOKEN_ENCRYPTION_KEY || process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error('Calendar token encryption secret is missing.');
  return createHash('sha256').update(secret).digest();
}
export async function saveProfessorToken(email: string, refreshToken: string): Promise<void> {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const encrypted = Buffer.concat([cipher.update(refreshToken, 'utf8'), cipher.final()]);
  const value = [iv, cipher.getAuthTag(), encrypted].map(x => x.toString('base64')).join('.');
  await integrationMutation('saveToken',{professorEmail:email,encrypted:value});
}
export async function hasProfessorRefreshToken(email: string): Promise<boolean> {
  return Boolean(await integrationQuery('token',{professorEmail:email}));
}
export async function loadProfessorRefreshToken(email: string): Promise<string | null> {
  const result = await integrationQuery('token',{professorEmail:email});
  const value: string | undefined = result?.encrypted;
  if (!value) return null;
  const [iv,tag,data] = value.split('.').map(x=>Buffer.from(x,'base64'));
  const decipher = createDecipheriv('aes-256-gcm', key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data),decipher.final()]).toString('utf8');
}
