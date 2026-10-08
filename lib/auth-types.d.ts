import type { DefaultSession } from 'next-auth';

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      role: 'admin' | 'student';
      studentId: number | null;
    } & DefaultSession['user'];
  }

  interface User {
    role?: 'admin' | 'student';
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    role?: 'admin' | 'student';
    studentId?: number | null;
  }
}
