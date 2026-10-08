import { handleRoute, json } from '@/lib/api';
import { getSession, requireAdmin, sessionEmail } from '@/lib/session';
import { runWeeklySummary } from '@/lib/email/weekly';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST() {
  return handleRoute(async () => {
    const session = requireAdmin(await getSession());
    return json(await runWeeklySummary(sessionEmail(session)));
  });
}
