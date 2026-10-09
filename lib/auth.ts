/**
 * Competition demo access. Any non-empty password is accepted; use synthetic
 * data only. Email must be an @iiitdm.ac.in address. The exact
 * PROFESSOR_EMAIL is admin; every other permitted email is a student.
 */
import { createHash } from 'node:crypto';
import type { NextAuthOptions } from 'next-auth';
import CredentialsProvider from 'next-auth/providers/credentials';
import GoogleProvider from 'next-auth/providers/google';
import { hasProfessorRefreshToken, saveProfessorToken } from './tokens';
import { convexApi, convexClient, convexSecret } from './convex';
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

async function provisionStudent(email: string, name: string, phone: string): Promise<{ id: string; name: string } | null> {
  const professorEmail = getProfessorEmail();
  if (!professorEmail) return null;
  const teacher = await convexClient().mutation(convexApi.upsertDemoTeacher,{secret:convexSecret(),email:professorEmail,name:'Professor'});
  const students=await convexClient().query(convexApi.listStudents,{secret:convexSecret(),teacherId:teacher.id});
  const existing=students.find((s:{email:string})=>s.email===email);
  const result=existing
    ? await convexClient().mutation(convexApi.updateStudent,{secret:convexSecret(),teacherId:teacher.id,id:existing._id,changes:{name:name.trim(),phone:phone.trim()}})
    : await convexClient().mutation(convexApi.createStudent,{secret:convexSecret(),teacherId:teacher.id,student:{rollNumber:loginRollNumber(email),name:name.trim(),email,phone:phone.trim()}});
  return {id:String(result.id??result._id??result),name:name.trim()};
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
        if (isProfessorEmail(email)) {
          await convexClient().mutation(convexApi.upsertDemoTeacher,{secret:convexSecret(),email,name:name.trim(),phone:phone.trim()});
          return { id: email, email, name: name.trim() };
        }
        const student = await provisionStudent(email, name, phone);
        return student ? { id: String(student.id), email, name: student.name } : null;
      },
    }),
    ...(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_CALENDAR_ACCOUNT ? [GoogleProvider({
      id:'google-professor',name:'Connect professor Google Calendar',
      clientId:process.env.GOOGLE_CLIENT_ID,clientSecret:process.env.GOOGLE_CLIENT_SECRET,
      authorization:{params:{scope:'openid email profile https://www.googleapis.com/auth/calendar.freebusy https://www.googleapis.com/auth/calendar.events',access_type:'offline',prompt:'consent'}},
    })] : []),
  ],
  callbacks: {
    async signIn({ user, account, profile }) {
      if(account?.provider==='google-professor') {
        const verified = (profile as { email_verified?: unknown } | undefined)?.email_verified;
        return normalizeEmail(user.email ?? '') === normalizeEmail(process.env.GOOGLE_CALENDAR_ACCOUNT ?? '') && (verified === true || verified === 'true');
      }
      return account?.provider === DEMO_CREDENTIALS_PROVIDER_ID && isStudentDomainEmail(user.email);
    },
    async jwt({ token,account }) {
      // OAuth verifies the dedicated Calendar account, then returns to the
      // professor's application identity instead of replacing it with Gmail.
      const email = account?.provider === 'google-professor'
        ? getProfessorEmail()
        : normalizeEmail(token.email ?? '');
      token.email = email;
      // Demo credentials can impersonate the professor. Only a completed,
      // allowlisted Google OAuth sign-in establishes control of this account.
      if (account) token.verifiedProfessor = account.provider === 'google-professor';
      token.role = isProfessorEmail(email) ? 'admin' : 'student';
      token.studentId = token.role === 'student' ? (await findStudentByEmail(email))?.id ?? null : null;
      if(token.role==='admin') {
        if(account?.provider==='google-professor' && account.refresh_token) await saveProfessorToken(email,account.refresh_token);
        token.hasCalendar=await hasProfessorRefreshToken(email);
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = String(token.sub ?? '');
        session.user.role = token.role === 'admin' ? 'admin' : 'student';
        session.user.studentId = token.studentId ?? null;
        session.user.hasCalendar = Boolean(token.hasCalendar);
        session.user.verifiedProfessor = token.role === 'admin' && token.verifiedProfessor === true;
      }
      return session;
    },
  },
};

export function configuredProfessorEmail(): string {
  return getProfessorEmail();
}
