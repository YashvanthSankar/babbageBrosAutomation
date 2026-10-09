import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Session } from 'next-auth';

vi.mock('@/lib/tokens', () => ({
  hasProfessorRefreshToken: vi.fn().mockResolvedValue(true),
  saveProfessorToken: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/lib/roster', () => ({ findStudentByEmail: vi.fn().mockResolvedValue(null) }));
vi.mock('@/lib/env', () => ({
  getProfessorEmail: () => 'professor@iiitdm.ac.in',
  isProfessorEmail: (email: string) => email === 'professor@iiitdm.ac.in',
  isStudentDomainEmail: (email: string) => email.endsWith('@iiitdm.ac.in'),
  normalizeEmail: (email: string) => email.trim().toLowerCase(),
}));
import { authOptions } from '@/lib/auth';
import { requireVerifiedProfessor } from '@/lib/session';

const professorToken = { email: 'professor@iiitdm.ac.in', sub: 'professor@iiitdm.ac.in' };
const callbacks = authOptions.callbacks!;
afterEach(() => vi.unstubAllEnvs());

describe('verified professor session boundary', () => {
  it('does not trust a demo-credentials session even if a Calendar token exists', async () => {
    const token = await callbacks.jwt!({ token: professorToken, account: { provider: 'demo-credentials' } } as never);
    expect(token.hasCalendar).toBe(true);
    expect(token.verifiedProfessor).toBe(false);
    const session = await callbacks.session!({ session: { user: { email: token.email } }, token } as never) as Session;
    expect(session.user.verifiedProfessor).toBe(false);
    expect(() => requireVerifiedProfessor(session)).toThrow();
  });

  it('marks only a completed allowlisted OAuth sign-in as verified', async () => {
    vi.stubEnv('GOOGLE_CALENDAR_ACCOUNT', 'yasaone19@gmail.com');
    expect(await callbacks.signIn!({ user: { email: 'yasaone19@gmail.com' }, account: { provider: 'google-professor' }, profile: { email_verified: true } } as never)).toBe(true);
    expect(await callbacks.signIn!({ user: { email: 'another@gmail.com' }, account: { provider: 'google-professor' }, profile: { email_verified: true } } as never)).toBe(false);
    expect(await callbacks.signIn!({ user: { email: 'yasaone19@gmail.com' }, account: { provider: 'google-professor' }, profile: { email_verified: false } } as never)).toBe(false);
    const token = await callbacks.jwt!({ token: { email: 'yasaone19@gmail.com' }, account: { provider: 'google-professor' } } as never);
    expect(token.email).toBe('professor@iiitdm.ac.in');
    expect(token.verifiedProfessor).toBe(true);
    const session = await callbacks.session!({ session: { user: { email: token.email } }, token } as never) as Session;
    expect(requireVerifiedProfessor(session)).toBe(session);
  });

  it('rejects a later credentials sign-in instead of inheriting Google verification', async () => {
    const token = await callbacks.jwt!({ token: { ...professorToken, verifiedProfessor: true }, account: { provider: 'demo-credentials' } } as never);
    expect(token.verifiedProfessor).toBe(false);
  });
});
