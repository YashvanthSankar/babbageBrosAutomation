import { and, asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { subjects } from "@/lib/db/schema";
import { requireTeacherId } from "@/lib/auth";
import { fail, handleRouteError, ok } from "@/lib/api";
import { subjectInput, subjectPatch } from "@/lib/validation";

export const runtime = "nodejs";

export async function GET() {
  try {
    const teacherId = await requireTeacherId();
    return ok(await db.select().from(subjects).where(eq(subjects.teacherId, teacherId)).orderBy(asc(subjects.name)));
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    const teacherId = await requireTeacherId();
    const input = subjectInput.parse(await request.json());
    const [created] = await db.insert(subjects).values({ teacherId, ...input, code: input.code || null }).returning();
    return ok(created, { status: 201 });
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const teacherId = await requireTeacherId();
    const { id, ...changes } = subjectPatch.parse(await request.json());
    const updateValues = {
      ...changes,
      ...(changes.code !== undefined ? { code: changes.code || null } : {}),
      updatedAt: new Date(),
    };
    const [updated] = await db
      .update(subjects)
      .set(updateValues)
      .where(and(eq(subjects.id, id), eq(subjects.teacherId, teacherId)))
      .returning();
    if (!updated) return fail("NOT_FOUND", "Subject not found.", 404);
    return ok(updated);
  } catch (error) {
    return handleRouteError(error);
  }
}
