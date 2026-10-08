/**
 * POST /api/imports/attendance/preview
 *
 * Canonical `.xlsx` attendance preview (ported from the `upload` branch).
 * Requires multipart/form-data fields `file` and `subjectId`. Unknown roll
 * numbers, duplicate dates, invalid statuses, and malformed headers are
 * blocking errors; blank cells are unrecorded (a warning). Nothing is written
 * to `attendance_records` until confirmation.
 */
import type { NextResponse } from 'next/server';
import { ApiError, handleRoute, json } from '@/lib/api';
import { getSession, requireAdmin, sessionEmail } from '@/lib/session';
import {
  isUploadValidationError,
  parseSubjectId,
  readUploadFile,
} from '@/lib/imports/http';
import { parseAttendanceCsv } from '@/lib/imports/csv';
import { parseAttendanceWorkbook } from '@/lib/imports/parser';
import { listKnownStudents, requireSubject, stageImport } from '@/lib/imports/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<NextResponse> {
  return handleRoute(async () => {
    const session = requireAdmin(await getSession());
    const professorEmail = sessionEmail(session);

    const form = await request.formData();
    const subjectId = parseSubjectId(form.get('subjectId'));
    await requireSubject(professorEmail, subjectId);

    let file;
    try {
      file = await readUploadFile(form.get('file'));
    } catch (error) {
      if (isUploadValidationError(error)) {
        throw new ApiError(422, 'INVALID_WORKBOOK', (error as Error).message);
      }
      throw error;
    }

    const knownStudents = await listKnownStudents(professorEmail);
    const result =
      file.kind === 'xlsx'
        ? await parseAttendanceWorkbook(file.buffer, subjectId, knownStudents)
        : parseAttendanceCsv(file.buffer.toString('utf8'), subjectId, knownStudents);

    const staged = await stageImport({
      professorEmail,
      filename: file.filename,
      buffer: file.buffer,
      type: 'attendance',
      payload: result.payload,
      report: result.report,
      preview: result.preview,
      subjectId,
    });
    return json({ data: staged });
  });
}
