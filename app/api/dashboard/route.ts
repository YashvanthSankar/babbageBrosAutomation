/**
 * GET /api/dashboard
 *
 * Session-scoped. The client never supplies an identity: the role and student
 * are derived from the authenticated session email mapped to the roster.
 */
import type { NextResponse } from 'next/server';
import { ApiError, handleRoute, json } from '@/lib/api';
import { getAdminDashboard, getStudentDashboard } from '@/lib/dashboard';
import { findStudentByEmail } from '@/lib/roster';
import { getSession, requireSession, sessionEmail } from '@/lib/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse> {
  return handleRoute(async () => {
    const session = requireSession(await getSession());
    const email = sessionEmail(session);

    if (session.user.role === 'admin') {
      return json(await getAdminDashboard(email));
    }

    const student = await findStudentByEmail(email);
    if (!student) {
      throw new ApiError(
        403,
        'NOT_IN_ROSTER',
        'Your account is not on the professor roster. Ask the professor to import your record.',
      );
    }
    return json(await getStudentDashboard(student));
  });
}
