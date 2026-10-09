/** Professor-only demo call. Never dispatch to a number supplied by the browser. */
import type { NextRequest, NextResponse } from 'next/server';
import { ApiError, handleRoute, json } from '@/lib/api';
import { getSession, requireAdmin, sessionEmail } from '@/lib/session';
import { integrationMutation } from '@/lib/integrations-store';
import { demoVoiceRecipient, liveDemoAutomationsEnabled } from '@/lib/automation/mode';
import { dispatchAttendanceCall, isIndianE164Phone, OmniDimensionDispatchError } from '@/lib/voice/omnidim';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ATTENDANCE_PERCENTAGE = 69;

export async function POST(request: NextRequest): Promise<NextResponse> {
  return handleRoute(async () => {
    const professorEmail = sessionEmail(requireAdmin(await getSession()));
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
    if (requested !== undefined && (typeof requested !== 'string' || requested.trim() !== pinnedNumber)) {
      throw new ApiError(422, 'INVALID_PHONE', 'Demo calls are restricted to the server-approved test number.');
    }

    const live = liveDemoAutomationsEnabled();
    if (live && !isIndianE164Phone(pinnedNumber)) {
      throw new ApiError(503, 'VOICE_NOT_CONFIGURED', 'Configure a consenting test number on the server.');
    }
    if (live && (!process.env.OMNIDIM_API_KEY || !Number.isInteger(Number(process.env.OMNIDIM_AGENT_ID)) || Number(process.env.OMNIDIM_AGENT_ID) <= 0 || !Number.isInteger(Number(process.env.OMNIDIM_FROM_NUMBER_ID)) || Number(process.env.OMNIDIM_FROM_NUMBER_ID) <= 0)) {
      throw new ApiError(503, 'VOICE_NOT_CONFIGURED', 'Configure OmniDimension on the server.');
    }

    const id = await integrationMutation('claimAggregate', {
      professorEmail,
      kind: 'manual_demo_voice',
      key: `manual-voice:${new Date().toISOString().slice(0, 10)}`,
      totalStudents: 0,
      atRiskStudents: 0,
    });
    if (!id) throw new ApiError(429, 'DEMO_CALL_RATE_LIMITED', 'This demo call has already run today.');

    if (!live) {
      await integrationMutation('finishAggregate', { id, professorEmail, status: 'simulated' });
      return json({ call: { dispatched: false, simulated: true, attendancePercentage: ATTENDANCE_PERCENTAGE } }, 201);
    }

    try {
      await dispatchAttendanceCall({ toNumber: pinnedNumber, attendancePercentage: ATTENDANCE_PERCENTAGE });
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
