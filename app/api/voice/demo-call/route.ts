/** Manual example call: live entered contacts require verified faculty OAuth. */
import type { NextRequest, NextResponse } from 'next/server';
import { ApiError, handleRoute, json } from '@/lib/api';
import { getSession, requireAdmin, requireVerifiedProfessor, sessionEmail } from '@/lib/session';
import { integrationMutation } from '@/lib/integrations-store';
import { demoVoiceRecipient, liveDemoAutomationsEnabled, manualRecipientDeliveryEnabled } from '@/lib/automation/mode';
import { dispatchAttendanceCall, isIndianE164Phone, OmniDimensionDispatchError } from '@/lib/voice/omnidim';

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

    const pinnedNumber = demoVoiceRecipient();
    const requested = (body as { phone?: unknown }).phone;
    if (requested !== undefined && (typeof requested !== 'string' || !isIndianE164Phone(requested))) throw new ApiError(422, 'INVALID_PHONE', 'Use a valid Indian mobile number in +91 format.');
    const enteredNumber = requested === undefined ? null : (requested as string).trim();

    const live = liveDemoAutomationsEnabled();
    const enteredLive = live && enteredNumber !== null && manualRecipientDeliveryEnabled();
    if (live && enteredNumber && !enteredLive && enteredNumber !== pinnedNumber) {
      throw new ApiError(422, 'RECIPIENT_NOT_APPROVED', 'Calling an entered number is not enabled on the server.');
    }
    if (enteredLive) {
      requireVerifiedProfessor(session);
      if ((body as { consentConfirmed?: unknown }).consentConfirmed !== true) throw new ApiError(422, 'CONSENT_REQUIRED', 'Confirm that this contact agreed to receive the test call.');
    }
    const number = enteredLive ? (enteredNumber ?? pinnedNumber) : pinnedNumber;
    if (live && !isIndianE164Phone(number)) {
      throw new ApiError(503, 'VOICE_NOT_CONFIGURED', 'Configure a consenting test number on the server.');
    }
    if (live && (!process.env.OMNIDIM_API_KEY || !Number.isInteger(Number(process.env.OMNIDIM_AGENT_ID)) || Number(process.env.OMNIDIM_AGENT_ID) <= 0 || !Number.isInteger(Number(process.env.OMNIDIM_FROM_NUMBER_ID)) || Number(process.env.OMNIDIM_FROM_NUMBER_ID) <= 0)) {
      throw new ApiError(503, 'VOICE_NOT_CONFIGURED', 'Configure OmniDimension on the server.');
    }

    const day = new Date().toISOString().slice(0, 10);
    const id = await integrationMutation('claimAggregate', {
      professorEmail,
      kind: 'manual_demo_voice',
      key: `manual-voice-${live ? 'live' : 'simulation'}:${day}`,
      ...(live ? { legacyKey: `manual-voice:${day}` } : {}),
      totalStudents: 0,
      atRiskStudents: 0,
    });
    if (!id) throw new ApiError(429, 'MANUAL_CALL_RATE_LIMITED', live ? 'Daily limit reached (10 calls per day). Try again tomorrow.' : 'Daily preview limit reached. No call was placed.');

    if (!live) {
      await integrationMutation('finishAggregate', { id, professorEmail, status: 'simulated' });
      return json({ call: { dispatched: false, simulated: true, attendancePercentage: ATTENDANCE_PERCENTAGE } }, 201);
    }

    try {
      await dispatchAttendanceCall({ toNumber: number, attendancePercentage: ATTENDANCE_PERCENTAGE });
      await integrationMutation('finishAggregate', { id, professorEmail, status: 'dispatched' });
      return json({ call: { dispatched: true, simulated: false, attendancePercentage: ATTENDANCE_PERCENTAGE } }, 201);
    } catch (error) {
      await integrationMutation('finishAggregate', { id, professorEmail, status: 'failed' });
      if (error instanceof OmniDimensionDispatchError) {
        throw new ApiError(error.status >= 500 ? 502 : error.status, 'VOICE_DISPATCH_FAILED', error.message);
      }
      throw error;
    }
  });
}
