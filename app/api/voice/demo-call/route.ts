/** Manual example call: an admin professor places one synthetic call to one
 * entered E.164 number. Dispatch is always attempted live regardless of DEMO
 * flags; only the adapter's provider credentials can block it. */
import type { NextRequest, NextResponse } from 'next/server';
import { ApiError, handleRoute, json } from '@/lib/api';
import { getSession, requireAdmin, sessionEmail } from '@/lib/session';
import { integrationMutation } from '@/lib/integrations-store';
import {
  dispatchAttendanceCall,
  isE164Phone,
  OmniDimensionDispatchError,
  OmniDimensionNotConfiguredError,
} from '@/lib/voice/omnidim';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ATTENDANCE_PERCENTAGE = 69;

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
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new ApiError(400, 'INVALID_BODY', 'Expected a JSON object.');
    }

    // The entered number is required and validated before any attempt is claimed.
    const requested = (body as { phone?: unknown }).phone;
    if (typeof requested !== 'string' || !isE164Phone(requested)) {
      throw new ApiError(422, 'INVALID_PHONE', 'Enter one valid international phone number in E.164 format (for example +14155552671).');
    }
    const number = requested.trim();

    // The shared Convex counter caps this at ten live attempts per professor per
    // UTC day; the legacy key preserves a same-day pre-migration attempt.
    const day = new Date().toISOString().slice(0, 10);
    const id = await integrationMutation('claimAggregate', {
      professorEmail,
      kind: 'manual_demo_voice',
      key: `manual-voice-live:${day}`,
      legacyKey: `manual-voice:${day}`,
      totalStudents: 0,
      atRiskStudents: 0,
    });
    if (!id) throw new ApiError(429, 'MANUAL_CALL_RATE_LIMITED', 'Daily limit reached (10 calls per day). Try again tomorrow.');

    try {
      await dispatchAttendanceCall({ toNumber: number, attendancePercentage: ATTENDANCE_PERCENTAGE });
      await integrationMutation('finishAggregate', { id, professorEmail, status: 'dispatched' });
      return json({ call: { dispatched: true, simulated: false, attendancePercentage: ATTENDANCE_PERCENTAGE } }, 201);
    } catch (error) {
      // A claimed attempt always consumes one of the daily allowance.
      await integrationMutation('finishAggregate', { id, professorEmail, status: 'failed' });
      if (error instanceof OmniDimensionNotConfiguredError) {
        throw new ApiError(503, 'VOICE_NOT_CONFIGURED', error.message);
      }
      if (error instanceof OmniDimensionDispatchError) {
        throw new ApiError(error.status >= 500 ? 502 : error.status, 'VOICE_DISPATCH_FAILED', error.message);
      }
      throw error;
    }
  });
}
