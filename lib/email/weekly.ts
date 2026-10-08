import { integrationMutation, integrationQuery } from '../integrations-store';
import { demoEmailRecipient, liveDemoAutomationsEnabled } from '../automation/mode';
import { isEmailAddress, normalizeRecipient } from './demo';

export type CohortCounts = { totalStudents: number; atRiskStudents: number; subjects: number };

/** ISO week in UTC, including the correct ISO week-year at New Year. */
export function isoWeek(date: Date): string {
  const day = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  day.setUTCDate(day.getUTCDate() + 4 - (day.getUTCDay() || 7));
  const year = day.getUTCFullYear();
  const start = new Date(Date.UTC(year, 0, 1));
  const week = Math.ceil((((day.getTime() - start.getTime()) / 86400000) + 1) / 7);
  return `${year}-W${String(week).padStart(2, '0')}`;
}

export function weeklyReadiness() {
  const live = liveDemoAutomationsEnabled();
  const pinned = demoEmailRecipient();
  const adviser = normalizeRecipient(process.env.FACULTY_ADVISER_EMAIL ?? '');
  const provider = Boolean(process.env.RESEND_API_KEY && process.env.RESEND_FROM_EMAIL);
  return { cronConfigured: Boolean(process.env.CRON_SECRET && process.env.PROFESSOR_EMAIL),
    liveSummaryAllowed: live && provider && isEmailAddress(pinned),
    liveAdviserAllowed: live && provider && isEmailAddress(pinned) && adviser === pinned,
    adviserConfigured: isEmailAddress(adviser) };
}

/** Keep all live email content synthetic, even when real aggregate counts are calculated. */
async function sendSynthetic(kind: 'weekly_summary' | 'adviser_alert', key: string) {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json', 'Idempotency-Key': key },
    body: JSON.stringify({ from: process.env.RESEND_FROM_EMAIL, to: [demoEmailRecipient()],
      subject: kind === 'weekly_summary' ? '[Synthetic demo] Weekly support digest' : '[Synthetic demo] Faculty adviser escalation',
      text: 'Synthetic demo notification. Review the signed-in faculty activity feed for aggregate risk counts. No uploaded student data, identity, contact, marks or attendance is included.' }),
    signal: AbortSignal.timeout(10_000), cache: 'no-store',
  });
  if (!response.ok) throw new Error('EMAIL_DISPATCH_FAILED');
}

export async function runWeeklySummary(professorEmail: string, now = new Date()) {
  const counts: CohortCounts = await integrationQuery('cohortCounts', { professorEmail });
  const week = isoWeek(now);
  const readiness = weeklyReadiness();
  const results: Record<string, string> = {};
  for (const kind of ['weekly_summary', 'adviser_alert'] as const) {
    if (kind === 'adviser_alert' && (!counts.atRiskStudents || !readiness.adviserConfigured)) {
      results[kind] = 'not_applicable';
      continue;
    }
    const id = await integrationMutation('claimAggregate', { professorEmail, kind,
      key: `${kind}:${week}`, totalStudents: counts.totalStudents, atRiskStudents: counts.atRiskStudents });
    if (!id) { results[kind] = 'already_run'; continue; }
    const live = kind === 'weekly_summary' ? readiness.liveSummaryAllowed : readiness.liveAdviserAllowed;
    if (!live) {
      await integrationMutation('finishAggregate', { id, professorEmail, status: 'simulated' });
      results[kind] = 'simulated';
      continue;
    }
    try {
      await sendSynthetic(kind, `${professorEmail}:${kind}:${week}`);
      await integrationMutation('finishAggregate', { id, professorEmail, status: 'dispatched' });
      results[kind] = 'provider_accepted';
    } catch {
      await integrationMutation('finishAggregate', { id, professorEmail, status: 'failed' });
      results[kind] = 'failed';
    }
  }
  return { week, counts, results };
}
