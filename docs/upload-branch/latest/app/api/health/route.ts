import { fail, ok } from "@/lib/api";
import { convexApi, convexClient, convexSecret } from "@/lib/convex";

export const runtime = "nodejs";

export async function GET() {
  try {
    await convexClient().query(convexApi.health, { secret: convexSecret() });
    return ok({ status: "ok", datastore: "convex", timestamp: new Date().toISOString() });
  } catch {
    return fail("DATASTORE_UNAVAILABLE", "The API is running but Convex is unavailable.", 503);
  }
}

