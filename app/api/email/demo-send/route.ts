/** Professor-only demo email to a professor-entered address with fixed synthetic attendance context. */
import type { NextRequest } from 'next/server';
import type { NextResponse } from 'next/server';
import { ApiError, handleRoute, json } from '@/lib/api';
import { getSession, requireAdmin } from '@/lib/session';
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

const RECIPIENT_COOLDOWN_MS = 10 * 60 * 1000;
const GLOBAL_WINDOW_MS = 60 * 60 * 1000;
const GLOBAL_LIMIT = 30;
const recentByRecipient = new Map<string, number>();
let recentSends: number[] = [];

function reserveDemoSend(recipient: string) {
  const now = Date.now();
  recentSends = recentSends.filter((timestamp) => now - timestamp < GLOBAL_WINDOW_MS);
  for (const [address, timestamp] of recentByRecipient) {
    if (now - timestamp >= RECIPIENT_COOLDOWN_MS) recentByRecipient.delete(address);
  }
  const previous = recentByRecipient.get(recipient);
  if (previous && now - previous < RECIPIENT_COOLDOWN_MS) {
    throw new ApiError(429, 'DEMO_EMAIL_RATE_LIMITED', 'That address received a demo email recently. Please wait 10 minutes before trying again.');
  }
  if (recentSends.length >= GLOBAL_LIMIT) {
    throw new ApiError(429, 'DEMO_EMAIL_RATE_LIMITED', 'The demo email limit has been reached. Please try again later.');
  }
  recentByRecipient.set(recipient, now);
  recentSends.push(now);
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
    const raw = typeof (body as { email?: unknown } | null)?.email === 'string'
      ? (body as { email: string }).email
      : '';
    const email = normalizeRecipient(raw);
    if (!isEmailAddress(email)) {
      throw new ApiError(422, 'INVALID_EMAIL', 'Enter a valid email address.');
    }

    reserveDemoSend(email);
    try {
      await dispatchDemoAttendanceEmail({ to: email, attendancePercentage: DEMO_ATTENDANCE_PERCENTAGE });
      return json({ email: { dispatched: true, attendancePercentage: DEMO_ATTENDANCE_PERCENTAGE } }, 201);
    } catch (error) {
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
