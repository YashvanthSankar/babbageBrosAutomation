import { requireTeacherId } from "@/lib/auth";
import { fail, handleRouteError, ok } from "@/lib/api";
import { convexApi, convexClient, convexSecret } from "@/lib/convex";

export const runtime = "nodejs";

export async function POST(_request: Request, context: { params: Promise<{ batchId: string }> }) {
  try {
    const teacherId = await requireTeacherId();
    const { batchId } = await context.params;
    return ok(await convexClient().mutation(convexApi.confirmImport, { secret: convexSecret(), teacherId, batchId }));
  } catch (error) {
    if (error instanceof Error && error.message.includes("BATCH_HAS_ERRORS")) return fail("BATCH_HAS_ERRORS", "Fix workbook errors and create a new preview before confirming.", 409);
    if (error instanceof Error && error.message.includes("BATCH_UNAVAILABLE")) return fail("BATCH_UNAVAILABLE", "This preview was not found, expired, or was already confirmed.", 409);
    return handleRouteError(error);
  }
}
