/**
 * Session helpers for route handlers. Server-only.
 */
import { getServerSession } from 'next-auth';
import type { Session } from 'next-auth';
import { authOptions } from './auth';
import { ApiError } from './api';

export async function getSession(): Promise<Session | null> {
  return getServerSession(authOptions);
}

export function requireSession(session: Session | null): Session {
  if (!session?.user) {
    throw new ApiError(401, 'UNAUTHENTICATED', 'You must sign in to use this endpoint.');
  }
  return session;
}

export function requireAdmin(session: Session | null): Session {
  const authed = requireSession(session);
  if (authed.user.role !== 'admin') {
    throw new ApiError(403, 'FORBIDDEN', 'Administrator access is required.');
  }
  return authed;
}

export function requireStudent(session: Session | null): Session {
  const authed = requireSession(session);
  if (authed.user.role !== 'student') {
    throw new ApiError(403, 'FORBIDDEN', 'This action is only available to students.');
  }
  return authed;
}

export function sessionEmail(session: Session): string {
  return (session.user.email ?? '').trim().toLowerCase();
}
