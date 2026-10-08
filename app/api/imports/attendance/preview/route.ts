import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { handleRouteError, fail, ok } from "@/lib/api";
import { requireTeacherId } from "@/lib/auth";
import { db } from "@/lib/db";
import { students, subjects } from "@/lib/db/schema";
import { parseAttendanceWorkbook } from "@/lib/imports/parser";
import { stageImport, validateWorkbookFile } from "@/lib/imports/http";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const teacherId = await requireTeacherId();
    const formData = await request.formData();
    const subjectId = z.string().uuid().parse(formData.get("subjectId"));
    const [subject] = await db
      .select({ id: subjects.id })
      .from(subjects)
      .where(and(eq(subjects.id, subjectId), eq(subjects.teacherId, teacherId)))
      .limit(1);
    if (!subject) return fail("SUBJECT_NOT_FOUND", "Choose a valid subject.", 404);
    const file = validateWorkbookFile(formData.get("file"));
    const knownStudents = await db
      .select({ id: students.id, rollNumber: students.rollNumber, active: students.active })
      .from(students)
      .where(eq(students.teacherId, teacherId));
    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await parseAttendanceWorkbook(buffer, subjectId, knownStudents);
    return ok(await stageImport(teacherId, file.name, buffer, result, subjectId));
  } catch (error) {
    if (error instanceof Error && /workbook|\.xlsx|MiB|empty/i.test(error.message)) {
      return fail("INVALID_WORKBOOK", error.message, 422);
    }
    return handleRouteError(error);
  }
}
