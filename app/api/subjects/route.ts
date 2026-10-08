import { requireTeacherId } from "@/lib/auth";
import { handleRouteError, ok } from "@/lib/api";
import { subjectInput, subjectPatch } from "@/lib/validation";
import { convexApi, convexClient, convexSecret } from "@/lib/convex";

export const runtime = "nodejs";

export async function GET() {
  try {
    const teacherId = await requireTeacherId();
    const rows = await convexClient().query(convexApi.listSubjects, { secret: convexSecret(), teacherId });
    return ok(rows.map(({ _id, _creationTime, normalizedName, teacherId: _teacherId, ...row }: any) => ({ id: _id, ...row })));
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    const teacherId = await requireTeacherId();
    const input = subjectInput.parse(await request.json());
    const created = await convexClient().mutation(convexApi.createSubject, { secret: convexSecret(), teacherId, subject: { ...input, code: input.code || undefined } });
    return ok({ id: created._id, name: created.name, code: created.code ?? null, attendanceThreshold: created.attendanceThreshold, marksThreshold: created.marksThreshold }, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const teacherId = await requireTeacherId();
    const { id, ...changes } = subjectPatch.parse(await request.json());
    const updated = await convexClient().mutation(convexApi.updateSubject, { secret: convexSecret(), teacherId, id, changes: { ...changes, ...(changes.code !== undefined ? { code: changes.code || undefined } : {}) } });
    return ok({ id: updated._id, name: updated.name, code: updated.code ?? null, attendanceThreshold: updated.attendanceThreshold, marksThreshold: updated.marksThreshold });
  } catch (error) {
    return handleRouteError(error);
  }
}
