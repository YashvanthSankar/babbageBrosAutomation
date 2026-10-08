/** Professor-only public-demo call with a fixed synthetic attendance context. */
import type { NextRequest } from 'next/server';
import type { NextResponse } from 'next/server';
import { ApiError, handleRoute, json } from '@/lib/api';
import { getSession, requireAdmin } from '@/lib/session';
import {
  dispatchAttendanceCall,
  isIndianE164Phone,
  OmniDimensionDispatchError,
  OmniDimensionNotConfiguredError,
} from '@/lib/voice/omnidim';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ATTENDANCE_PERCENTAGE = 69;
const PHONE_COOLDOWN_MS = 10 * 60 * 1000;
const GLOBAL_WINDOW_MS = 60 * 60 * 1000;
const GLOBAL_LIMIT = 12;
const recentByPhone = new Map<string, number>();
let recentCalls: number[] = [];

function reserveDemoCall(phone: string) {
  const now = Date.now();
  recentCalls = recentCalls.filter((timestamp) => now - timestamp < GLOBAL_WINDOW_MS);
  for (const [number, timestamp] of recentByPhone) {
    if (now - timestamp >= PHONE_COOLDOWN_MS) recentByPhone.delete(number);
  }
  const previous = recentByPhone.get(phone);
  if (previous && now - previous < PHONE_COOLDOWN_MS) {
    throw new ApiError(429, 'DEMO_CALL_RATE_LIMITED', 'That number was called recently. Please wait 10 minutes before trying again.');
  }
  if (recentCalls.length >= GLOBAL_LIMIT) {
    throw new ApiError(429, 'DEMO_CALL_RATE_LIMITED', 'The demo call limit has been reached. Please try again later.');
  }
  recentByPhone.set(phone, now);
  recentCalls.push(now);
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  return handleRoute(async () => {
    requireAdmin(await getSession());
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new ApiError(400, 'INVALID_BODY', 'Request body must be valid JSON.');
    }
    const phone = typeof (body as { phone?: unknown } | null)?.phone === 'string'
      ? (body as { phone: string }).phone.trim()
      : '';
    if (!isIndianE164Phone(phone)) {
      throw new ApiError(422, 'INVALID_PHONE', 'Enter a valid Indian mobile number in +91 E.164 format.');
    }

    reserveDemoCall(phone);
    try {
      await dispatchAttendanceCall({ toNumber: phone, attendancePercentage: ATTENDANCE_PERCENTAGE });
      return json({ call: { dispatched: true, attendancePercentage: ATTENDANCE_PERCENTAGE } }, 201);
    } catch (error) {
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
