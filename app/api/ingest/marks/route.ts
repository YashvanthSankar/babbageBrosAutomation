/**
 * POST /api/ingest/marks
 *
 * One-shot marks import used by the professor dashboard's Imports tab.
 * Accepts multipart/form-data with a CSV file and optional subjectId, or an
 * Excel file with subjectId, assessmentName, assessmentDate, and maxMarks.
 * Valid scores are upserted into Convex marks records.
 */
import type { NextResponse } from 'next/server';
import { ApiError, handleRoute, json } from '@/lib/api';
import { getSession, requireAdmin, sessionEmail } from '@/lib/session';
import { isUploadValidationError, readUploadFile, toRowErrors } from '@/lib/imports/http';
import { parseMarksCsv } from '@/lib/imports/csv';
import { parseMarksWorkbook } from '@/lib/imports/parser';
import { applyMarks, listKnownStudents, requireSubject } from '@/lib/imports/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<NextResponse> {
  return handleRoute(async () => {
    const session = requireAdmin(await getSession());
    const professorEmail = sessionEmail(session);

    const form = await request.formData();
    const rawSubject = form.get('subjectId');
    const subjectId =
      typeof rawSubject === 'string' && rawSubject.trim() !== ''
        ? rawSubject.trim()
        : null;
    if (subjectId !== null && !subjectId) {
      throw new ApiError(422, 'VALIDATION_ERROR', 'Choose a valid subject.');
    }
    if (subjectId !== null) {
      await requireSubject(professorEmail, subjectId);
    }

    let file;
    try {
      file = await readUploadFile(form.get('file'));
    } catch (error) {
      if (isUploadValidationError(error)) {
        throw new ApiError(422, 'INVALID_WORKBOOK', (error as Error).message);
      }
      throw error;
    }

    let result;
    if (file.kind === 'xlsx') {
      if (!subjectId) throw new ApiError(422, 'VALIDATION_ERROR', 'Choose a subject for an Excel marks sheet.');
      const assessmentName = String(form.get('assessmentName') ?? '').trim();
      const assessmentDate = String(form.get('assessmentDate') ?? '').trim();
      const maxMarks = Number(form.get('maxMarks'));
      if (assessmentName.length < 2 || !/^\d{4}-\d{2}-\d{2}$/.test(assessmentDate) ||
          Number.isNaN(Date.parse(assessmentDate)) ||
          new Date(assessmentDate).toISOString().slice(0, 10) !== assessmentDate ||
          !Number.isFinite(maxMarks) || maxMarks <= 0) {
        throw new ApiError(422, 'VALIDATION_ERROR', 'Enter a test name, valid date, and positive maximum marks for the Excel sheet.');
      }
      result = await parseMarksWorkbook(file.buffer, { subjectId, assessmentName, assessmentDate, maxMarks }, await listKnownStudents(professorEmail));
    } else {
      result = parseMarksCsv(file.buffer.toString('utf8'), subjectId);
    }
    if (result.report.errors.length) return json({ imported: 0, updated: 0, errors: toRowErrors(result.report.errors) });
    const applied = await applyMarks(professorEmail, subjectId, result.payload.entries);
    return json({
      imported: applied.imported,
      updated: applied.updated,
      errors: [...toRowErrors(result.report.errors), ...applied.errors],
    });
  });
}
