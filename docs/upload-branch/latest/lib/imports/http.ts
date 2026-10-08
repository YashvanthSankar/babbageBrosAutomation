import { createHash } from "node:crypto";
import { convexApi, convexClient, convexSecret } from "@/lib/convex";
import type { ParseResult, AttendancePayload, MarksPayload, RosterPayload } from "./types";

export function validateWorkbookFile(value: FormDataEntryValue | null) {
  if (!(value instanceof File)) throw new Error("Choose an .xlsx workbook to upload.");
  if (!value.name.toLowerCase().endsWith(".xlsx")) throw new Error("Only .xlsx workbooks are supported.");
  const configuredLimit = Number(process.env.MAX_UPLOAD_BYTES ?? 1_048_576);
  const limit = Number.isFinite(configuredLimit) && configuredLimit > 0 ? configuredLimit : 1_048_576;
  if (value.size === 0) throw new Error("The uploaded workbook is empty.");
  if (value.size > limit) throw new Error(`The workbook exceeds the ${Math.ceil(limit / 1_048_576)} MiB limit.`);
  return value;
}

export async function stageImport(
  teacherId: string,
  filename: string,
  buffer: Buffer,
  result: ParseResult<RosterPayload | AttendancePayload | MarksPayload>,
  subjectId?: string,
) {
  const batch = await convexClient().mutation(convexApi.stageImport, {
    secret: convexSecret(), teacherId, subjectId, type: result.payload.kind, filename,
    checksum: createHash("sha256").update(buffer).digest("hex"), payload: result.payload, report: result.report,
  });
  return {
    batchId: batch.batchId,
    expiresAt: batch.expiresAt,
    canConfirm: result.report.errors.length === 0,
    report: result.report,
    preview: result.preview,
  };
}

