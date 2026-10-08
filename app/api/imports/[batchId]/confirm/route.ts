import { and, eq, gt, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { attendanceRecords, importBatches, students } from "@/lib/db/schema";
import { requireTeacherId } from "@/lib/auth";
import { fail, handleRouteError, ok } from "@/lib/api";
import type { AttendancePayload, RosterPayload } from "@/lib/imports/types";

export const runtime = "nodejs";

function chunks<T>(items: T[], size: number) {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size));
  return result;
}

export async function POST(
  _request: Request,
  context: { params: Promise<{ batchId: string }> },
) {
  try {
    const teacherId = await requireTeacherId();
    const { batchId } = await context.params;
    const result = await db.transaction(async (tx) => {
      const [claimed] = await tx
        .update(importBatches)
        .set({ status: "processing" })
        .where(
          and(
            eq(importBatches.id, batchId),
            eq(importBatches.teacherId, teacherId),
            eq(importBatches.status, "pending"),
            gt(importBatches.expiresAt, new Date()),
          ),
        )
        .returning();

      if (!claimed) return null;
      if (claimed.validationReport.errors.length) {
        throw new Error("BATCH_HAS_ERRORS");
      }

      let processed = 0;
      if (claimed.type === "roster") {
        const payload = claimed.parsedPayload as RosterPayload;
        for (const group of chunks(payload.rows, 500)) {
          await tx
            .insert(students)
            .values(
              group.map((row) => ({
                teacherId,
                rollNumber: row.rollNumber,
                name: row.name,
                email: row.email,
                phone: row.phone,
                active: true,
              })),
            )
            .onConflictDoUpdate({
              target: [students.teacherId, students.rollNumber],
              set: {
                name: sql`excluded.name`,
                email: sql`excluded.email`,
                phone: sql`excluded.phone`,
                active: true,
                updatedAt: new Date(),
              },
            });
          processed += group.length;
        }
      } else {
        const payload = claimed.parsedPayload as AttendancePayload;
        const studentRows = await tx
          .select({ id: students.id, rollNumber: students.rollNumber })
          .from(students)
          .where(eq(students.teacherId, teacherId));
        const studentMap = new Map(studentRows.map((student) => [student.rollNumber.toLowerCase(), student.id]));
        const values = payload.entries.map((entry) => {
          const studentId = studentMap.get(entry.rollNumber.toLowerCase());
          if (!studentId) throw new Error(`Student ${entry.rollNumber} no longer exists.`);
          return {
            studentId,
            subjectId: payload.subjectId,
            attendanceDate: entry.date,
            status: entry.status,
            sourceImportId: claimed.id,
          };
        });
        for (const group of chunks(values, 500)) {
          await tx
            .insert(attendanceRecords)
            .values(group)
            .onConflictDoUpdate({
              target: [attendanceRecords.studentId, attendanceRecords.subjectId, attendanceRecords.attendanceDate],
              set: {
                status: sql`excluded.status`,
                sourceImportId: claimed.id,
                updatedAt: new Date(),
              },
            });
          processed += group.length;
        }
      }

      await tx
        .update(importBatches)
        .set({ status: "confirmed", confirmedAt: new Date() })
        .where(eq(importBatches.id, claimed.id));
      return { batchId: claimed.id, type: claimed.type, processed };
    });

    if (!result) return fail("BATCH_UNAVAILABLE", "This preview was not found, expired, or was already confirmed.", 409);
    return ok(result);
  } catch (error) {
    if (error instanceof Error && error.message === "BATCH_HAS_ERRORS") {
      return fail("BATCH_HAS_ERRORS", "Fix workbook errors and create a new preview before confirming.", 409);
    }
    return handleRouteError(error);
  }
}
