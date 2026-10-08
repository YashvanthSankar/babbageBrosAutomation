/** POST /api/voice/call { studentId, subjectId } — professor-only manual call. */
import type { NextRequest } from 'next/server';
import type { NextResponse } from 'next/server';
import { ApiError, handleRoute, json } from '@/lib/api';
import { getSession, requireAdmin, sessionEmail } from '@/lib/session';
import { dispatchAtRiskAttendanceCall } from '@/lib/voice/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function positiveInteger(value: unknown): string | null {
  return typeof value==='string'&&value.trim()?value.trim():null;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  return handleRoute(async () => {
    const session = requireAdmin(await getSession());
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new ApiError(400, 'INVALID_BODY', 'Request body must be valid JSON.');
    }
    const payload = (body ?? {}) as { studentId?: unknown; subjectId?: unknown };
    const studentId = positiveInteger(payload.studentId);
    const subjectId = positiveInteger(payload.subjectId);
    if (!studentId || !subjectId) {
      throw new ApiError(422, 'VALIDATION_ERROR', 'studentId and subjectId must be valid record IDs.');
    }

    const result = await dispatchAtRiskAttendanceCall(studentId, subjectId, sessionEmail(session));
    return json({ call: result });
  });
}
