/**
 * NextAuth configuration.
 *
 * - Google (default)        : student sign-in, profile/email scopes only.
 * - Google (professor)      : professor sign-in, adds Calendar free/busy +
 *                             events scopes with offline access. Its callback
 *                             URL is /api/auth/callback/google-professor.
 * - Demo credentials        : OPT-IN, disabled unless DEMO_AUTH_ENABLED=true.
 *                             Accepts an email plus any NON-EMPTY password and
 *                             is intended only for synthetic/demo data. It is
 *                             NOT authentication and must never be enabled on a
 *                             deployment holding real student data.
 *
 * Authorization is never inferred from the email domain alone:
 *   - admin  : session email === PROFESSOR_EMAIL (exact, config-driven)
 *   - student: verified @iiitdm.ac.in email AND present in the roster.
 *     Under the demo provider the domain check still applies and roster
 *     membership is still required; the password is never verified.
 *
 * Email credentials are NOT Google authorization: they can never mint or read a
 * Google Calendar token. The professor must still complete the Google
 * `google-professor` OAuth flow (below) to grant Calendar consent; the resulting
 * refresh token is stored encrypted server-side (lib/tokens.ts), never in the JWT.
 */
import type { NextAuthOptions } from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';
import CredentialsProvider from 'next-auth/providers/credentials';
import {
  getProfessorEmail,
  isProfessorEmail,
  isStudentDomainEmail,
  normalizeEmail,
} from './env';
import { findStudentByEmail } from './roster';
import { hasProfessorRefreshToken, saveProfessorToken } from './tokens';

const STUDENT_SCOPES = 'openid email profile';

/** Provider id for the opt-in demo email/password flow. */
export const DEMO_CREDENTIALS_PROVIDER_ID = 'demo-credentials';

/**
 * The demo flow is strictly opt-in. Anything other than an explicit `true`
 * (unset, empty, `false`, `1`, ...) leaves it disabled — there is no default.
 */
export function isDemoAuthEnabled(): boolean {
  return (process.env.DEMO_AUTH_ENABLED ?? '').trim().toLowerCase() === 'true';
}

interface DemoIdentity {
  ok: boolean;
  name?: string;
}

/**
 * Resolve a demo sign-in email to an identity, applying the SAME authorization
 * rules as real sign-in: the exact PROFESSOR_EMAIL is the only admin, and a
 * student must be on the @iiitdm.ac.in domain AND present in the roster.
 * The password is deliberately not part of this decision.
 */
async function resolveDemoIdentity(email: string): Promise<DemoIdentity> {
  if (isProfessorEmail(email)) {
    return { ok: true, name: 'Professor (demo)' };
  }
  if (!isStudentDomainEmail(email)) {
    return { ok: false };
  }
  try {
    const student = await findStudentByEmail(email);
    if (!student) return { ok: false };
    return { ok: true, name: student.name };
  } catch (error) {
    console.error('[auth] demo roster lookup failed during sign-in', error);
    return { ok: false };
  }
}

const CALENDAR_SCOPES = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/calendar.freebusy',
  'https://www.googleapis.com/auth/calendar.events',
].join(' ');

function emailVerified(profile: unknown): boolean {
  if (!profile || typeof profile !== 'object') return false;
  const value = (profile as { email_verified?: unknown }).email_verified;
  return value === true || value === 'true';
}

const providers: NextAuthOptions['providers'] = [
  GoogleProvider({
    clientId: process.env.GOOGLE_CLIENT_ID ?? '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
    authorization: {
      params: { scope: STUDENT_SCOPES, prompt: 'select_account' },
    },
  }),
  GoogleProvider({
    id: 'google-professor',
    name: 'Professor (Google Calendar)',
    clientId: process.env.GOOGLE_CLIENT_ID ?? '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET ?? '',
    authorization: {
      params: {
        scope: CALENDAR_SCOPES,
        access_type: 'offline',
        prompt: 'consent',
      },
    },
  }),
];

// Registered only when explicitly enabled. When DEMO_AUTH_ENABLED is unset the
// provider does not exist, so there is no demo attack surface by default.
if (isDemoAuthEnabled()) {
  providers.push(
    CredentialsProvider({
      id: DEMO_CREDENTIALS_PROVIDER_ID,
      name: 'Demo sign in (synthetic data only)',
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password (any non-empty value)', type: 'password' },
      },
      async authorize(credentials) {
        // Defense in depth: the provider should not even be registered otherwise.
        if (!isDemoAuthEnabled()) return null;

        const email = normalizeEmail(credentials?.email ?? '');
        // Any NON-EMPTY password is accepted. It is never verified, hashed,
        // logged, or stored — this is impersonation-grade demo access only.
        const password = credentials?.password ?? '';
        if (!email || password.length === 0) return null;

        const identity = await resolveDemoIdentity(email);
        if (!identity.ok) return null;

        return {
          id: email,
          email,
          name: identity.name ?? email,
        };
      },
    }),
  );
}

export const authOptions: NextAuthOptions = {
  secret: process.env.NEXTAUTH_SECRET,
  session: { strategy: 'jwt' },
  providers,
  callbacks: {
    async signIn({ user, profile, account }) {
      const email = normalizeEmail(user.email ?? '');
      if (!email) return false;

      // Opt-in demo credentials. The provider only exists when enabled, but we
      // re-check the flag and re-apply the same authorization rules here so the
      // decision never relies on the provider being absent.
      if (account?.provider === DEMO_CREDENTIALS_PROVIDER_ID) {
        if (!isDemoAuthEnabled()) return false;
        const identity = await resolveDemoIdentity(email);
        return identity.ok;
      }

      // The calendar-scoped provider is reserved for the professor so students
      // are never asked to grant calendar permissions.
      if (account?.provider === 'google-professor' && !isProfessorEmail(email)) {
        return false;
      }

      // Exact, config-driven admin. Never derived from the domain.
      if (isProfessorEmail(email)) return true;

      // Students: verified Google email, institution domain, roster membership.
      if (!emailVerified(profile)) return false;
      if (!isStudentDomainEmail(email)) return false;
      try {
        const student = await findStudentByEmail(email);
        return Boolean(student);
      } catch (error) {
        console.error('[auth] roster lookup failed during sign-in', error);
        return false;
      }
    },

    async jwt({ token, account }) {
      const email = normalizeEmail(token.email ?? '');
      const isAdmin = isProfessorEmail(email);
      token.role = isAdmin ? 'admin' : 'student';

      if (account) {
        token.provider = account.provider;
      }

      if (isAdmin) {
        if (account?.provider === 'google-professor') {
          if (account.refresh_token) {
            try {
              await saveProfessorToken(email, {
                refreshToken: account.refresh_token,
                accessToken: account.access_token ?? null,
                scope: account.scope ?? null,
                tokenType: account.token_type ?? null,
                expiresAt: account.expires_at
                  ? new Date(account.expires_at * 1000).toISOString()
                  : null,
              });
              token.hasCalendar = true;
            } catch (error) {
              console.error('[auth] failed to persist professor calendar token', error);
              token.hasCalendar = false;
            }
          } else {
            // Consent already granted; keep whatever refresh token we have.
            token.hasCalendar = await hasProfessorRefreshToken(email);
          }
        } else if (token.hasCalendar === undefined) {
          token.hasCalendar = await hasProfessorRefreshToken(email);
        }
        token.studentId = null;
      } else {
        token.hasCalendar = false;
        if (token.studentId === undefined) {
          try {
            const student = await findStudentByEmail(email);
            token.studentId = student?.id ?? null;
          } catch (error) {
            console.error('[auth] roster lookup failed while building session', error);
            token.studentId = null;
          }
        }
      }

      return token;
    },

    async session({ session, token }) {
      if (session.user) {
        session.user.id = String(token.sub ?? '');
        session.user.role = token.role ?? (isProfessorEmail(session.user.email) ? 'admin' : 'student');
        session.user.studentId = token.studentId ?? null;
        session.user.hasCalendar = Boolean(token.hasCalendar);
      }
      return session;
    },
  },
  debug: false,
};

/** The configured professor address, exposed for setup/health messaging. */
export function configuredProfessorEmail(): string {
  return getProfessorEmail();
}
