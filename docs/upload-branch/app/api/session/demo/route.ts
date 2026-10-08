import { db } from "@/lib/db";
import { teachers } from "@/lib/db/schema";
import { createSession } from "@/lib/auth";
import { handleRouteError, ok } from "@/lib/api";

export const runtime = "nodejs";

export async function POST() {
  try {
    const email = process.env.DEMO_TEACHER_EMAIL ?? "demo@attendly.local";
    const name = process.env.DEMO_TEACHER_NAME ?? "Demo Faculty";
    const [teacher] = await db
      .insert(teachers)
      .values({ email, name })
      .onConflictDoUpdate({ target: teachers.email, set: { name } })
      .returning();
    await createSession(teacher.id);
    return ok({ teacher: { id: teacher.id, name: teacher.name, email: teacher.email } });
  } catch (error) {
    return handleRouteError(error);
  }
}
