import { requireTeacherId } from "@/lib/auth";
import { fail, handleRouteError, ok } from "@/lib/api";
import { studentInput, studentPatch } from "@/lib/validation";
import { convexApi, convexClient, convexSecret } from "@/lib/convex";

export const runtime = "nodejs";

export async function GET() {
  try {
    const teacherId = await requireTeacherId();
    const rows = await convexClient().query(convexApi.listStudents, { secret: convexSecret(), teacherId });
    return ok(rows.map(({ _id, _creationTime, normalizedRoll, teacherId: _teacherId, ...row }: any) => ({ id: _id, ...row })));
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    const teacherId = await requireTeacherId();
    const input = studentInput.parse(await request.json());
    const created = await convexClient().mutation(convexApi.createStudent, { secret: convexSecret(), teacherId, student: input });
    return ok({ id: created._id, rollNumber: created.rollNumber, name: created.name, email: created.email, phone: created.phone, active: created.active }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message.includes("DUPLICATE_ROLL")) {
      return fail("DUPLICATE_ROLL", "That roll number already exists.", 409);
    }
    return handleRouteError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const teacherId = await requireTeacherId();
    const { id, ...changes } = studentPatch.parse(await request.json());
    const updated = await convexClient().mutation(convexApi.updateStudent, { secret: convexSecret(), teacherId, id, changes });
    return ok({ id: updated._id, rollNumber: updated.rollNumber, name: updated.name, email: updated.email, phone: updated.phone, active: updated.active });
  } catch (error) {
    return handleRouteError(error);
  }
}

