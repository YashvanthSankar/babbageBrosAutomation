import { handleRoute, json } from '@/lib/api';
import { getSession, requireAdmin, sessionEmail } from '@/lib/session';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  return handleRoute(async () => {
    const session = requireAdmin(await getSession());
    return json({
      professorEmail: sessionEmail(session),
      googleAccountEmail: process.env.GOOGLE_CALENDAR_ACCOUNT?.trim().toLowerCase() || null,
      configured: Boolean(process.env.GOOGLE_CLIENT_ID?.trim() && process.env.GOOGLE_CLIENT_SECRET?.trim() && process.env.GOOGLE_CALENDAR_ACCOUNT?.trim()),
      connected: Boolean(session.user.hasCalendar),
    });
  });
}
