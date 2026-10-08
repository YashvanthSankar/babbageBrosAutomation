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
import { dispatchAtRiskAttendanceCall, findAtRiskStudentIds } from '@/lib/voice/service';

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

    const atRiskBeforeImport = await findAtRiskStudentIds(professorEmail, subjectId);
    const applied = await applyAttendance(professorEmail, subjectId, result.payload.entries);

    const studentIdByRoll = new Map(
      knownStudents.map((student) => [student.rollNumber.trim().toLowerCase(), student.id]),
    );
    const touchedStudentIds = new Set(
      result.payload.entries
        .map((entry) => studentIdByRoll.get(entry.rollNumber.trim().toLowerCase()))
        .filter((id): id is number => id !== undefined),
    );
    // A successful import must not be undone if a provider is unavailable.
    // Calls occur only when a student newly crosses below the threshold.
    await Promise.all(
      [...touchedStudentIds]
        .filter((studentId) => !atRiskBeforeImport.has(studentId))
        .map(async (studentId) => {
          try {
            await dispatchAtRiskAttendanceCall(studentId, subjectId, professorEmail);
          } catch (error) {
            console.error('[voice] automatic call dispatch failed', error);
          }
        }),
    );
    return json({
      imported: applied.imported,
      updated: applied.updated,
      errors: [...toRowErrors(result.report.errors), ...applied.errors],
    });
  });
}
