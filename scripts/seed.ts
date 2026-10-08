import { db, sql } from "../lib/db";
import { teachers } from "../lib/db/schema";

async function seed() {
  const email = process.env.DEMO_TEACHER_EMAIL ?? "demo@attendly.local";
  const name = process.env.DEMO_TEACHER_NAME ?? "Demo Faculty";
  const [teacher] = await db
    .insert(teachers)
    .values({ email, name })
    .onConflictDoUpdate({ target: teachers.email, set: { name } })
    .returning();
  console.log(`Demo teacher ready: ${teacher.email}`);
}

seed()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await sql.end();
  });
