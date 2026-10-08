import { z } from "zod";
import { fail, handleRouteError, ok } from "@/lib/api";
import { requireTeacherId } from "@/lib/auth";
import { convexApi, convexClient, convexSecret } from "@/lib/convex";
import { stageImport, validateWorkbookFile } from "@/lib/imports/http";
import { parseMarksWorkbook } from "@/lib/imports/parser";

export const runtime = "nodejs";

const metadataSchema = z.object({
  subjectId: z.string().min(1),
  assessmentName: z.string().trim().min(2).max(120),
  assessmentDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD"),
  maxMarks: z.coerce.number().positive().max(10_000),
});

export async function POST(request: Request) {
  try {
    const teacherId = await requireTeacherId();
    const formData = await request.formData();
    const metadata = metadataSchema.parse({
      subjectId: formData.get("subjectId"), assessmentName: formData.get("assessmentName"),
      assessmentDate: formData.get("assessmentDate"), maxMarks: formData.get("maxMarks"),
    });
    const date = new Date(`${metadata.assessmentDate}T00:00:00Z`);
    if (Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== metadata.assessmentDate) return fail("VALIDATION_ERROR", "Assessment date is invalid.", 422);
    const subjects = await convexClient().query(convexApi.listSubjects, { secret: convexSecret(), teacherId });
    if (!subjects.some((subject: any) => subject._id === metadata.subjectId)) return fail("SUBJECT_NOT_FOUND", "Choose a valid subject.", 404);
    const students = await convexClient().query(convexApi.listStudents, { secret: convexSecret(), teacherId });
    const knownStudents = students.map((student: any) => ({ id: student._id, rollNumber: student.rollNumber, active: student.active }));
    const file = validateWorkbookFile(formData.get("file"));
    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await parseMarksWorkbook(buffer, metadata, knownStudents);
    return ok(await stageImport(teacherId, file.name, buffer, result, metadata.subjectId));
  } catch (error) {
    if (error instanceof Error && /workbook|\.xlsx|MiB|empty/i.test(error.message)) return fail("INVALID_WORKBOOK", error.message, 422);
    return handleRouteError(error);
  }
}

