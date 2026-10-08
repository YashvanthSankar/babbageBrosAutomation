/**
 * POST /api/imports/roster/preview
 *
 * Canonical `.xlsx` roster preview (ported from the `upload` branch). Accepts
 * multipart/form-data with a `file` field, stores a single-use staged batch, and
 * returns the validation report. Nothing is written to `students` until
 * `/api/imports/{batchId}/confirm` runs.
 */
import type { NextResponse } from 'next/server';
import { ApiError, handleRoute, json } from '@/lib/api';
import { getSession, requireAdmin, sessionEmail } from '@/lib/session';
import { isUploadValidationError, readUploadFile } from '@/lib/imports/http';
import { parseRosterCsv } from '@/lib/imports/csv';
import { parseRosterWorkbook } from '@/lib/imports/parser';
import { stageImport } from '@/lib/imports/service';

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

    const staged = await stageImport({
      professorEmail,
      filename: file.filename,
      buffer: file.buffer,
      type: 'roster',
      payload: result.payload,
      report: result.report,
      preview: result.preview,
    });
    return json({ data: staged });
  });
}
