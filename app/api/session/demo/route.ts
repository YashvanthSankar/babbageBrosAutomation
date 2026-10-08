import { createSession } from "@/lib/auth";
import { handleRouteError, ok } from "@/lib/api";
import { convexApi, convexClient, convexSecret } from "@/lib/convex";

export const runtime = "nodejs";

export async function POST() {
  try {
    const email = process.env.DEMO_TEACHER_EMAIL ?? "demo@attendly.local";
    const name = process.env.DEMO_TEACHER_NAME ?? "Demo Faculty";
    const teacher = await convexClient().mutation(convexApi.upsertDemoTeacher, { secret: convexSecret(), email, name });
    await createSession(teacher.id);
    return ok({ teacher });
  } catch (error) {
    return handleRouteError(error);
  }
}
