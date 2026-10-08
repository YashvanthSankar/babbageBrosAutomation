import { z } from "zod";
import { handleRouteError, fail, ok } from "@/lib/api";
import { requireTeacherId } from "@/lib/auth";
import { parseAttendanceWorkbook } from "@/lib/imports/parser";
import { stageImport, validateWorkbookFile } from "@/lib/imports/http";
import { convexApi, convexClient, convexSecret } from "@/lib/convex";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const teacherId = await requireTeacherId();
    const formData = await request.formData();
    const subjectId = z.string().min(1).parse(formData.get("subjectId"));
    const subjectRows = await convexClient().query(convexApi.listSubjects, { secret: convexSecret(), teacherId });
    const subject = subjectRows.find((row: any) => row._id === subjectId);
    if (!subject) return fail("SUBJECT_NOT_FOUND", "Choose a valid subject.", 404);
    const file = validateWorkbookFile(formData.get("file"));
    const studentRows = await convexClient().query(convexApi.listStudents, { secret: convexSecret(), teacherId });
    const knownStudents = studentRows.map((row: any) => ({ id: row._id, rollNumber: row.rollNumber, active: row.active }));
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
