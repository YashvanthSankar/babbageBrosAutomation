/** Manual example email: an admin professor sends one synthetic message to one
 * entered address. Delivery is always attempted live regardless of DEMO flags;
 * only the adapter's provider credentials can block it. */
import type { NextRequest } from 'next/server';
import type { NextResponse } from 'next/server';
import { ApiError, handleRoute, json } from '@/lib/api';
import { getSession, requireAdmin, sessionEmail } from '@/lib/session';
import { integrationMutation } from '@/lib/integrations-store';
import {
  DEMO_ATTENDANCE_PERCENTAGE,
  dispatchDemoAttendanceEmail,
  EmailDispatchError,
  EmailNotConfiguredError,
  isEmailAddress,
  normalizeRecipient,
} from '@/lib/email/demo';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest): Promise<NextResponse> {
  return handleRoute(async () => {
    const session = requireAdmin(await getSession());
    const professorEmail = sessionEmail(session);
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new ApiError(400, 'INVALID_BODY', 'Request body must be valid JSON.');
    }
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new ApiError(400, 'INVALID_BODY', 'Expected a JSON object.');

    // The entered address is required and validated before any attempt is claimed.
    const requested = (body as { email?: unknown }).email;
    if (typeof requested !== 'string' || requested.length > 254 || !isEmailAddress(normalizeRecipient(requested))) {
      throw new ApiError(422, 'INVALID_EMAIL', 'Enter one valid email address.');
    }
    const email = normalizeRecipient(requested);

    // The shared Convex counter caps this at ten live attempts per professor per
    // UTC day; the legacy key preserves a same-day pre-migration attempt.
    const day = new Date().toISOString().slice(0, 10);
    const id = await integrationMutation('claimAggregate', {
      professorEmail,
      kind: 'manual_demo_email',
      key: `manual-demo-live:${day}`,
      legacyKey: `manual-demo:${day}`,
      totalStudents: 0,
      atRiskStudents: 0,
    });
    if (!id) throw new ApiError(429, 'MANUAL_EMAIL_RATE_LIMITED', 'Daily limit reached (10 emails per day). Try again tomorrow.');

    try {
      await dispatchDemoAttendanceEmail({ to: email, attendancePercentage: DEMO_ATTENDANCE_PERCENTAGE });
      await integrationMutation('finishAggregate', { id, professorEmail, status: 'dispatched' });
      return json({ email: { dispatched: true, attendancePercentage: DEMO_ATTENDANCE_PERCENTAGE } }, 201);
    } catch (error) {
      // A claimed attempt always consumes one of the daily allowance.
      await integrationMutation('finishAggregate', { id, professorEmail, status: 'failed' });
      if (error instanceof EmailNotConfiguredError) {
        throw new ApiError(503, 'EMAIL_NOT_CONFIGURED', error.message);
      }
      if (error instanceof EmailDispatchError) {
        throw new ApiError(error.status >= 500 ? 502 : error.status, 'EMAIL_DISPATCH_FAILED', error.message);
      }
      throw error;
    }
  });
}
