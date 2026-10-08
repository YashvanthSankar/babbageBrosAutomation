import type { DefaultSession } from 'next-auth';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      role: 'admin' | 'student';
      studentId: string | null;
      hasCalendar: boolean;
    } & DefaultSession['user'];
  }

  interface User {
    role?: 'admin' | 'student';
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    role?: 'admin' | 'student';
    studentId?: string | null;
    hasCalendar?: boolean;
  }
}
