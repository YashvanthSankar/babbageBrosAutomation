import { handleRouteError, fail, ok } from "@/lib/api";
import { requireTeacherId } from "@/lib/auth";
import { parseRosterWorkbook } from "@/lib/imports/parser";
import { stageImport, validateWorkbookFile } from "@/lib/imports/http";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const teacherId = await requireTeacherId();
    const formData = await request.formData();
    const file = validateWorkbookFile(formData.get("file"));
    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await parseRosterWorkbook(buffer);
    return ok(await stageImport(teacherId, file.name, buffer, result));
  } catch (error) {
    if (error instanceof Error && /workbook|\.xlsx|MiB|empty/i.test(error.message)) {
      return fail("INVALID_WORKBOOK", error.message, 422);
    }
    return handleRouteError(error);
  }
}
