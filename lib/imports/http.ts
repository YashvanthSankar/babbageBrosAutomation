/**
 * Multipart upload validation. Accepts the canonical `.xlsx` workbooks and the
 * dashboard's `.csv` files. The original binary is never persisted.
 */
import { ApiError } from '@/lib/api';

export type UploadKind = 'xlsx' | 'csv';

export interface UploadedFile {
  filename: string;
  buffer: Buffer;
  kind: UploadKind;
}

function uploadLimit(): number {
  const configured = Number(process.env.MAX_UPLOAD_BYTES ?? 2_097_152);
  return Number.isFinite(configured) && configured > 0 ? configured : 2_097_152;
}

export async function readUploadFile(value: FormDataEntryValue | null): Promise<UploadedFile> {
  if (!(value instanceof File)) {
    throw new Error('Choose a .csv or .xlsx file to upload.');
  }
  const name = value.name.toLowerCase();
  const kind: UploadKind | null = name.endsWith('.xlsx')
    ? 'xlsx'
    : name.endsWith('.csv')
      ? 'csv'
      : null;
  if (!kind) throw new Error('Only .csv and .xlsx files are supported.');
  if (value.size === 0) throw new Error('The uploaded file is empty.');
  const limit = uploadLimit();
  if (value.size > limit) {
    throw new Error(`The file exceeds the ${Math.ceil(limit / 1_048_576)} MiB limit.`);
  }
  return { filename: value.name, buffer: Buffer.from(await value.arrayBuffer()), kind };
}

/** True when a thrown message looks like a file-validation failure. */
export function isUploadValidationError(error: unknown): boolean {
  return error instanceof Error && /\.csv|\.xlsx|MiB|empty|Choose a/i.test(error.message);
}

/** Map parser validation items to the `{ row, message }` shape the UI renders. */
export function toRowErrors(items: readonly { row?: number; message: string }[]) {
  return items.map((item) => ({ row: item.row ?? 1, message: item.message }));
}

/** Parse a `subjectId` form field into a positive integer. */
export function parseSubjectId(value: FormDataEntryValue | null): number {
  const raw = typeof value === 'string' ? value.trim() : '';
  const parsed = Number(raw);
  if (!raw || !Number.isInteger(parsed) || parsed <= 0) {
    throw new ApiError(422, 'VALIDATION_ERROR', 'Choose a valid subject.');
  }
  return parsed;
}
