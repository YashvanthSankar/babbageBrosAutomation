import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const globalForDb = globalThis as unknown as { attendlySql?: ReturnType<typeof postgres> };

function connectionString() {
  const value = process.env.DATABASE_URL;
  if (!value) throw new Error("DATABASE_URL is not configured");
  return value;
}

export const sql =
  globalForDb.attendlySql ??
  postgres(connectionString(), {
    max: process.env.NODE_ENV === "production" ? 5 : 2,
    prepare: false,
  });

if (process.env.NODE_ENV !== "production") globalForDb.attendlySql = sql;

export const db = drizzle(sql, { schema });
