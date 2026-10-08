/**
 * Competition demo access. Any non-empty password is accepted; use synthetic
 * data only. Email must be an @iiitdm.ac.in address. The exact
 * PROFESSOR_EMAIL is admin; every other permitted email is a student.
 */
import { createHash } from 'node:crypto';
import type { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import { query } from './db';
import { getProfessorEmail, isProfessorEmail, isStudentDomainEmail, normalizeEmail } from './env';
import { findStudentByEmail } from './roster';

export const DEMO_CREDENTIALS_PROVIDER_ID = 'demo-credentials';

function validName(value: string): boolean {
  return value.trim().length >= 2 && value.trim().length <= 80;
}

function validPhone(value: string): boolean {
  return /^\+91[6-9]\d{9}$/.test(value.trim());
}

function loginRollNumber(email: string): string {
  return `LOGIN-${createHash('sha256').update(email).digest('hex').slice(0, 12).toUpperCase()}`;
}

async function provisionStudent(email: string, name: string, phone: string): Promise<{ id: number; name: string } | null> {
  const professorEmail = getProfessorEmail();
  if (!professorEmail) return null;
  const result = await query<{ id: number; name: string }>(
    `INSERT INTO students (name, roll_no, email, phone, professor_email, active, updated_at)
     VALUES ($1, $2, $3, $4, $5, true, now())
     ON CONFLICT (email) DO UPDATE
       SET name = EXCLUDED.name, phone = EXCLUDED.phone, active = true, updated_at = now()
     RETURNING id, name`,
    [name.trim(), loginRollNumber(email), email, phone.trim(), professorEmail],
  );
  return result.rows[0] ?? null;
}

export const authOptions: NextAuthOptions = {
  secret: process.env.NEXTAUTH_SECRET,
  session: { strategy: 'jwt' },
  providers: [
    CredentialsProvider({
      id: DEMO_CREDENTIALS_PROVIDER_ID,
      name: 'Institute email demo',
      credentials: {
        email: { label: 'IIITDM email', type: 'email' },
        password: { label: 'Password', type: 'password' },
        name: { label: 'Full name', type: 'text' },
        phone: { label: 'Phone', type: 'tel' },
      },
      async authorize(credentials) {
        const email = normalizeEmail(credentials?.email ?? '');
        const password = credentials?.password ?? '';
        const name = credentials?.name ?? '';
        const phone = credentials?.phone ?? '';
        if (!isStudentDomainEmail(email) || !password.trim() || !validName(name) || !validPhone(phone)) return null;
        if (isProfessorEmail(email)) return { id: email, email, name: name.trim() };
        const student = await provisionStudent(email, name, phone);
        return student ? { id: String(student.id), email, name: student.name } : null;
      },
    }),
  ],
  callbacks: {
    async signIn({ user, account }) {
      return account?.provider === DEMO_CREDENTIALS_PROVIDER_ID && isStudentDomainEmail(user.email);
    },
    async jwt({ token }) {
      const email = normalizeEmail(token.email ?? '');
      token.role = isProfessorEmail(email) ? 'admin' : 'student';
      token.studentId = token.role === 'student' ? (await findStudentByEmail(email))?.id ?? null : null;
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = String(token.sub ?? '');
        session.user.role = token.role === 'admin' ? 'admin' : 'student';
        session.user.studentId = token.studentId ?? null;
      }
      return session;
    },
  },
};

export function configuredProfessorEmail(): string {
  return getProfessorEmail();
}
