/**
 * POST /api/ingest/roster
 *
 * One-shot roster import used by the professor dashboard's Imports tab.
 * Accepts multipart/form-data with a `file` field (.csv or .xlsx). Valid rows
 * are upserted into `students`; row-level problems are returned in `errors`.
 */
import type { NextResponse } from 'next/server';
import { ApiError, handleRoute, json } from '@/lib/api';
import { getSession, requireAdmin, sessionEmail } from '@/lib/session';
import { isUploadValidationError, readUploadFile, toRowErrors } from '@/lib/imports/http';
import { parseRosterCsv } from '@/lib/imports/csv';
import { parseRosterWorkbook } from '@/lib/imports/parser';
import { applyRoster } from '@/lib/imports/service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request): Promise<NextResponse> {
  return handleRoute(async () => {
    const session = requireAdmin(await getSession());
    const professorEmail = sessionEmail(session);

    const form = await request.formData();
    let file;
    try {
      file = await readUploadFile(form.get('file'));
    } catch (error) {
      if (isUploadValidationError(error)) {
        throw new ApiError(422, 'INVALID_WORKBOOK', (error as Error).message);
      }
      throw error;
    }

    const result =
      file.kind === 'xlsx'
        ? await parseRosterWorkbook(file.buffer)
        : parseRosterCsv(file.buffer.toString('utf8'));

    if (result.report.errors.length) return json({ imported: 0, updated: 0, errors: toRowErrors(result.report.errors) });
    const applied = await applyRoster(professorEmail, result.payload.rows);
    return json({
      imported: applied.imported,
      updated: applied.updated,
      errors: [...toRowErrors(result.report.errors), ...applied.errors],
    });
  });
}
