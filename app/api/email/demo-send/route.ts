/** Manual example email: live entered contacts require verified faculty OAuth. */
import type { NextRequest } from 'next/server';
import type { NextResponse } from 'next/server';
import { ApiError, handleRoute, json } from '@/lib/api';
import { getSession, requireAdmin, requireVerifiedProfessor, sessionEmail } from '@/lib/session';
import { integrationMutation } from '@/lib/integrations-store';
import { demoEmailRecipient, liveDemoAutomationsEnabled, manualRecipientDeliveryEnabled } from '@/lib/automation/mode';
import {
  DEMO_ATTENDANCE_PERCENTAGE,
  dispatchDemoAttendanceEmail,
  EmailDispatchError,
  EmailNotConfiguredError,
  isEmailAddress,
  normalizeRecipient,
  resendSandboxSender,
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
    const pinnedEmail = normalizeRecipient(demoEmailRecipient());
    const requested = (body as { email?: unknown }).email;
    if (requested !== undefined && (typeof requested !== 'string' || requested.length > 254 || !isEmailAddress(normalizeRecipient(requested)))) throw new ApiError(422, 'INVALID_EMAIL', 'Enter one valid email address.');
    const enteredEmail = requested === undefined ? null : normalizeRecipient(requested as string);
    const live = liveDemoAutomationsEnabled();
    const enteredLive = live && enteredEmail !== null && manualRecipientDeliveryEnabled();
    if (live && enteredEmail && !enteredLive && enteredEmail !== pinnedEmail) {
      throw new ApiError(422, 'RECIPIENT_NOT_APPROVED', 'Sending to an entered address is not enabled on the server.');
    }
    if (enteredLive) {
      requireVerifiedProfessor(session);
      if ((body as { consentConfirmed?: unknown }).consentConfirmed !== true) throw new ApiError(422, 'CONSENT_REQUIRED', 'Confirm that this contact agreed to receive the test email.');
      if (resendSandboxSender(process.env.RESEND_FROM_EMAIL ?? '') && enteredEmail !== pinnedEmail) {
        throw new ApiError(503, 'SENDER_DOMAIN_REQUIRED', 'Resend sandbox cannot reach this inbox. Verify a sending domain before sending to other consenting addresses.');
      }
    }
    const email = enteredLive ? (enteredEmail ?? pinnedEmail) : pinnedEmail;
    if (live && !isEmailAddress(email)) throw new ApiError(503, 'EMAIL_NOT_CONFIGURED', 'Configure a consenting test inbox on the server.');
    if (live && (!process.env.RESEND_API_KEY || !process.env.RESEND_FROM_EMAIL)) throw new ApiError(503, 'EMAIL_NOT_CONFIGURED', 'Configure Resend on the server.');
    // A public simulation must never exhaust the separate live-send allowance.
    const day = new Date().toISOString().slice(0,10);
    const id = await integrationMutation('claimAggregate', {professorEmail,kind:'manual_demo_email',key:`manual-demo-${live ? 'live' : 'simulation'}:${day}`,...(live?{legacyKey:`manual-demo:${day}`}:{ }),totalStudents:0,atRiskStudents:0});
    if (!id) throw new ApiError(429, 'MANUAL_EMAIL_RATE_LIMITED', live ? 'Daily limit reached (10 emails per day). Try again tomorrow.' : 'Daily preview limit reached. No email was sent.');
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
