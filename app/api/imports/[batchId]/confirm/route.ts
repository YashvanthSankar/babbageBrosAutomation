/**
 * POST /api/imports/{batchId}/confirm
 *
 * Atomically claims a pending staged batch and applies it. A batch is
 * single-use, teacher-scoped, and expires after 30 minutes. Roster confirmation
 * upserts `students`; attendance confirmation upserts `attendance_records`.
 */
import type { NextResponse } from 'next/server';
import { ApiError, handleRoute, json } from '@/lib/api';
import { getSession, requireAdmin, sessionEmail } from '@/lib/session';
import { confirmBatch } from '@/lib/imports/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(
  _request: Request,
  context: { params: { batchId: string } },
): Promise<NextResponse> {
  return handleRoute(async () => {
    const session = requireAdmin(await getSession());
    const professorEmail = sessionEmail(session);

    const batchId = Number(context.params.batchId);
    if (!Number.isInteger(batchId) || batchId <= 0) {
      throw new ApiError(404, 'BATCH_UNAVAILABLE', 'This preview was not found.');
    }

    const result = await confirmBatch(professorEmail, batchId);
    return json({ data: result });
  });
}
