import { sql as statement } from "drizzle-orm";
import { db } from "@/lib/db";
import { fail, ok } from "@/lib/api";

export const runtime = "nodejs";

export async function GET() {
  try {
    await db.execute(statement`select 1`);
    return ok({ status: "ok", database: "connected", timestamp: new Date().toISOString() });
  } catch {
    return fail("DATABASE_UNAVAILABLE", "The API is running but the database is unavailable.", 503);
  }
}
