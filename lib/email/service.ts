import { createHash } from 'node:crypto';
import { integrationMutation, integrationQuery } from '../integrations-store';
import { demoEmailRecipient, liveDemoAutomationsEnabled, liveDemoDailyKey } from '../automation/mode';

interface RiskTarget {
  studentId: string;
  subjectId: string;
  name: string;
  email: string;
  subjectName: string;
  attendancePercentage: number | null;
  threshold: number;
  classesToRecover: number;
  latestScore: number | null;
  previousScore: number | null;
  marksRisk: boolean;
  present: number;
  total: number;
}

function validEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

/** Public demos simulate by default. Live mode can only target the pinned test inbox. */
export async function dispatchRiskEmails(professorEmail: string, subjectId?: string) {
  const live = liveDemoAutomationsEnabled();
  const testRecipient = demoEmailRecipient();
  if (
    live &&
    (!process.env.RESEND_API_KEY || !process.env.RESEND_FROM_EMAIL || !validEmail(testRecipient))
  ) {
    return {
      sent: 0,
      failed: 0,
      skipped: 1,
      reason: 'Live email needs Resend credentials, a verified sender, and a pinned DEMO_AUTOMATION_EMAIL.',
    };
  }

  const targets: RiskTarget[] = await integrationQuery('riskTargets', {
    professorEmail,
    ...(subjectId ? { subjectId } : {}),
  });
  let sent = 0;
  let failed = 0;
  let skipped = 0;
  let simulated = 0;

  for (const target of targets) {
    // This is used only to create a stable, idempotent local simulation key.
    // It is never included in an outbound message.
    const snapshot = createHash('sha256')
      .update(JSON.stringify([target.present, target.total, target.latestScore, target.previousScore, target.threshold]))
      .digest('hex')
      .slice(0, 20);

    if (!live) {
      const key = `email-simulated:${target.studentId}:${target.subjectId}:${snapshot}`;
      const id = await integrationMutation('claimNotification', {
        professorEmail,
        studentId: target.studentId,
        subjectId: target.subjectId,
        key,
        provider: 'resend_email',
      });
      if (!id) {
        skipped++;
        continue;
      }
      await integrationMutation('finishNotification', { id, status: 'simulated' });
      simulated++;
      continue;
    }

    // Open demo sign-in means uploads are untrusted. Live mode therefore sends
    // only one fixed-content test message to a server-pinned, consenting inbox.
    const key = liveDemoDailyKey('resend-live');
    const id = await integrationMutation('claimNotification', {
      professorEmail,
      studentId: target.studentId,
      subjectId: target.subjectId,
      key,
      provider: 'resend_email',
    });
    if (!id) {
      skipped++;
      continue;
    }

    try {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': key,
        },
        body: JSON.stringify({
          from: process.env.RESEND_FROM_EMAIL,
          to: [testRecipient],
          subject: '[Demo test] Academic warning automation check',
          text: 'An at-risk record triggered the warning-email workflow. This message was sent only to the server-configured demo test inbox. No uploaded student identity, contact details, marks, or attendance values are included.',
        }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) throw new Error('EMAIL_DISPATCH_FAILED');
      await integrationMutation('finishNotification', { id, status: 'dispatched' });
      sent++;
    } catch {
      await integrationMutation('finishNotification', { id, status: 'failed' });
      failed++;
    }
  }

  return { sent, failed, skipped, simulated };
}
