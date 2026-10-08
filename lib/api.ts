import { NextResponse } from "next/server";
import { ZodError } from "zod";

export type ApiError = { code: string; message: string; fields?: unknown };

export function ok<T>(data: T, init?: ResponseInit) {
  return NextResponse.json({ data }, init);
}

export function fail(code: string, message: string, status = 400, fields?: unknown) {
  return NextResponse.json({ error: { code, message, fields } satisfies ApiError }, { status });
}

export function handleRouteError(error: unknown) {
  if (error instanceof ZodError) {
    return fail("VALIDATION_ERROR", "Please correct the highlighted fields.", 422, error.flatten());
  }
  if (error instanceof Error && error.message === "UNAUTHENTICATED") {
    return fail("UNAUTHENTICATED", "Please sign in to continue.", 401);
  }
  console.error(error);
  return fail("INTERNAL_ERROR", "Something went wrong. Please try again.", 500);
}
