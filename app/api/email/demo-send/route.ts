/** Professor-only, simulation-first demo email; optional live delivery only to a server-pinned test inbox. */
import type { NextRequest } from 'next/server';
import type { NextResponse } from 'next/server';
import { ApiError, handleRoute, json } from '@/lib/api';
import { getSession, requireAdmin, sessionEmail } from '@/lib/session';
import { integrationMutation } from '@/lib/integrations-store';
import { demoEmailRecipient, liveDemoAutomationsEnabled } from '@/lib/automation/mode';
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
    const email = normalizeRecipient(demoEmailRecipient());
    const requested = (body as { email?: unknown }).email;
    if (requested !== undefined && (typeof requested !== 'string' || normalizeRecipient(requested) !== email)) {
      throw new ApiError(422, 'INVALID_EMAIL', 'Demo delivery is restricted to the server-configured test inbox.');
    }
    const live = liveDemoAutomationsEnabled();
    if (live && !isEmailAddress(email)) throw new ApiError(503, 'EMAIL_NOT_CONFIGURED', 'Configure a consenting test inbox on the server.');
    if (live && (!process.env.RESEND_API_KEY || !process.env.RESEND_FROM_EMAIL)) throw new ApiError(503, 'EMAIL_NOT_CONFIGURED', 'Configure Resend on the server.');
    const id = await integrationMutation('claimAggregate', {professorEmail,kind:'manual_demo_email',key:`manual-demo:${new Date().toISOString().slice(0,10)}`,totalStudents:0,atRiskStudents:0});
    if (!id) throw new ApiError(429, 'DEMO_EMAIL_RATE_LIMITED', 'This demo has already run today.');
    if (!live) {
      await integrationMutation('finishAggregate', {id,professorEmail,status:'simulated'});
      return json({email:{dispatched:false,simulated:true,attendancePercentage:DEMO_ATTENDANCE_PERCENTAGE}},201);
    }
    try {
      await dispatchDemoAttendanceEmail({ to: email, attendancePercentage: DEMO_ATTENDANCE_PERCENTAGE });
      await integrationMutation('finishAggregate', {id,professorEmail,status:'dispatched'});
      return json({ email: { dispatched: true, attendancePercentage: DEMO_ATTENDANCE_PERCENTAGE } }, 201);
    } catch (error) {
      await integrationMutation('finishAggregate', {id,professorEmail,status:'failed'});
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
