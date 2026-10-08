import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";

let client: ConvexHttpClient | undefined;

export function convexClient() {
  const url = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!url) throw new Error("NEXT_PUBLIC_CONVEX_URL is not configured");
  client ??= new ConvexHttpClient(url);
  return client;
}

export function convexSecret() {
  const secret = process.env.CONVEX_BACKEND_SECRET;
  if (!secret) throw new Error("CONVEX_BACKEND_SECRET is not configured");
  return secret;
}

export const convexApi = {
  upsertDemoTeacher: makeFunctionReference<"mutation">("backend:upsertDemoTeacher"),
  listStudents: makeFunctionReference<"query">("backend:listStudents"),
  createStudent: makeFunctionReference<"mutation">("backend:createStudent"),
  updateStudent: makeFunctionReference<"mutation">("backend:updateStudent"),
  listSubjects: makeFunctionReference<"query">("backend:listSubjects"),
  createSubject: makeFunctionReference<"mutation">("backend:createSubject"),
  updateSubject: makeFunctionReference<"mutation">("backend:updateSubject"),
  stageImport: makeFunctionReference<"mutation">("backend:stageImport"),
  confirmImport: makeFunctionReference<"mutation">("backend:confirmImport"),
  dashboard: makeFunctionReference<"query">("backend:dashboard"),
  marksDashboard: makeFunctionReference<"query">("backend:marksDashboard"),
  health: makeFunctionReference<"query">("backend:health"),
};

export async function getProfessorTeacherId(email: string): Promise<string> {
  const teacher = await convexClient().mutation(convexApi.upsertDemoTeacher, {
    secret: convexSecret(), email: email.trim().toLowerCase(), name: 'Professor',
  });
  return String(teacher.id);
}
