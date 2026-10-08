import { timingSafeEqual } from 'node:crypto';
import { NextRequest } from 'next/server';
import { ApiError, handleRoute, json } from '@/lib/api';
import { runWeeklySummary } from '@/lib/email/weekly';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  return handleRoute(async () => {
    const secret = process.env.CRON_SECRET;
    const professorEmail = process.env.PROFESSOR_EMAIL?.trim().toLowerCase();
    if (!secret || !professorEmail) throw new ApiError(503, 'CRON_NOT_CONFIGURED', 'Weekly job is not configured.');
    const supplied = request.headers.get('authorization')?.replace(/^Bearer /i, '') ?? '';
    const expected = Buffer.from(secret);
    const actual = Buffer.from(supplied);
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new ApiError(401, 'UNAUTHORIZED', 'Invalid cron authorization.');
    return json(await runWeeklySummary(professorEmail));
  });
}
