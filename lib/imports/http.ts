import { createHash } from "node:crypto";
import { db } from "@/lib/db";
import { importBatches } from "@/lib/db/schema";
import type { ParseResult, AttendancePayload, RosterPayload } from "./types";

export function validateWorkbookFile(value: FormDataEntryValue | null) {
  if (!(value instanceof File)) throw new Error("Choose an .xlsx workbook to upload.");
  if (!value.name.toLowerCase().endsWith(".xlsx")) throw new Error("Only .xlsx workbooks are supported.");
  const configuredLimit = Number(process.env.MAX_UPLOAD_BYTES ?? 2_097_152);
  const limit = Number.isFinite(configuredLimit) && configuredLimit > 0 ? configuredLimit : 2_097_152;
  if (value.size === 0) throw new Error("The uploaded workbook is empty.");
  if (value.size > limit) throw new Error(`The workbook exceeds the ${Math.ceil(limit / 1_048_576)} MiB limit.`);
  return value;
}

export async function stageImport(
  teacherId: string,
  filename: string,
  buffer: Buffer,
  result: ParseResult<RosterPayload | AttendancePayload>,
  subjectId?: string,
) {
  const [batch] = await db
    .insert(importBatches)
    .values({
      teacherId,
      subjectId,
      type: result.payload.kind,
      filename,
      checksum: createHash("sha256").update(buffer).digest("hex"),
      parsedPayload: result.payload,
      validationReport: result.report,
      expiresAt: new Date(Date.now() + 30 * 60 * 1_000),
    })
    .returning({ id: importBatches.id, expiresAt: importBatches.expiresAt });
  return {
    batchId: batch.id,
    expiresAt: batch.expiresAt,
    canConfirm: result.report.errors.length === 0,
    report: result.report,
    preview: result.preview,
  };
}
