/**
 * POST /api/ingest/marks
 *
 * One-shot marks import used by the professor dashboard's Imports tab.
 * Accepts multipart/form-data with `file` (.csv or .xlsx) and an optional
 * `subjectId`; when absent, each row's `subject` column is matched against the
 * professor's subject code or name. Valid scores are upserted into
 * `test_results`, so a re-upload corrects the previous value.
 */
import type { NextResponse } from 'next/server';
import { ApiError, handleRoute, json } from '@/lib/api';
import { getSession, requireAdmin, sessionEmail } from '@/lib/session';
import { isUploadValidationError, readUploadFile, toRowErrors } from '@/lib/imports/http';
import { parseMarksCsv } from '@/lib/imports/csv';
import { applyMarks, requireSubject } from '@/lib/imports/service';

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
        ? Number(rawSubject)
        : null;
    if (subjectId !== null && (!Number.isInteger(subjectId) || subjectId <= 0)) {
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

    if (file.kind !== 'csv') {
      throw new ApiError(422, 'INVALID_WORKBOOK', 'Marks import currently accepts .csv files only.');
    }

    const result = parseMarksCsv(file.buffer.toString('utf8'), subjectId);
    const applied = await applyMarks(professorEmail, subjectId, result.payload.entries);
    return json({
      imported: applied.imported,
      updated: applied.updated,
      errors: [...toRowErrors(result.report.errors), ...applied.errors],
    });
  });
}
