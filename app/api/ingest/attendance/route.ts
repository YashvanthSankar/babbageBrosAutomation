/**
 * POST /api/ingest/attendance
 *
 * One-shot attendance import used by the professor dashboard's Imports tab.
 * Requires multipart/form-data fields `file` (.csv or .xlsx) and `subjectId`.
 * Valid records are upserted into `attendance_records`, so re-uploads correct
 * existing values instead of duplicating them.
 */
import type { NextResponse } from 'next/server';
import { ApiError, handleRoute, json } from '@/lib/api';
import { getSession, requireAdmin, sessionEmail } from '@/lib/session';
import {
  isUploadValidationError,
  parseSubjectId,
  readUploadFile,
  toRowErrors,
} from '@/lib/imports/http';
import { parseAttendanceCsv } from '@/lib/imports/csv';
import { parseAttendanceWorkbook } from '@/lib/imports/parser';
import { applyAttendance, listKnownStudents, requireSubject } from '@/lib/imports/service';

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

    if (result.report.errors.length) return json({ imported: 0, updated: 0, errors: toRowErrors(result.report.errors) });
    const applied = await applyAttendance(professorEmail, subjectId, result.payload.entries);
    return json({
      imported: applied.imported,
      updated: applied.updated,
      errors: [...toRowErrors(result.report.errors), ...applied.errors],
    });
  });
}
