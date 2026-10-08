import { convexApi, convexClient, convexSecret } from "../lib/convex";

async function seed() {
  const teacher = await convexClient().mutation(convexApi.upsertDemoTeacher, {
    secret: convexSecret(),
    email: process.env.DEMO_TEACHER_EMAIL ?? "demo@attendly.local",
    name: process.env.DEMO_TEACHER_NAME ?? "Demo Faculty",
  });
  console.log(`Demo teacher ready: ${teacher.email}`);
}

seed().catch((error) => { console.error(error); process.exitCode = 1; });
