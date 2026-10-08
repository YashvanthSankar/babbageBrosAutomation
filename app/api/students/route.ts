import { and, asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { students } from "@/lib/db/schema";
import { requireTeacherId } from "@/lib/auth";
import { fail, handleRouteError, ok } from "@/lib/api";
import { studentInput, studentPatch } from "@/lib/validation";

export const runtime = "nodejs";

export async function GET() {
  try {
    const teacherId = await requireTeacherId();
    const rows = await db.select().from(students).where(eq(students.teacherId, teacherId)).orderBy(asc(students.rollNumber));
    return ok(rows);
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    const teacherId = await requireTeacherId();
    const input = studentInput.parse(await request.json());
    const [created] = await db.insert(students).values({ teacherId, ...input }).returning();
    return ok(created, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message.includes("students_teacher_roll_unique")) {
      return fail("DUPLICATE_ROLL", "That roll number already exists.", 409);
    }
    return handleRouteError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const teacherId = await requireTeacherId();
    const { id, ...changes } = studentPatch.parse(await request.json());
    const [updated] = await db
      .update(students)
      .set({ ...changes, updatedAt: new Date() })
      .where(and(eq(students.id, id), eq(students.teacherId, teacherId)))
      .returning();
    if (!updated) return fail("NOT_FOUND", "Student not found.", 404);
    return ok(updated);
  } catch (error) {
    return handleRouteError(error);
  }
}
