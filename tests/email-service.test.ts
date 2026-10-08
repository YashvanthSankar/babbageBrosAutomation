import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { integrationQuery, integrationMutation, request } = vi.hoisted(() => ({
  integrationQuery: vi.fn(),
  integrationMutation: vi.fn(),
  request: vi.fn(),
}));
vi.mock('@/lib/integrations-store', () => ({ integrationQuery, integrationMutation }));
import { dispatchRiskEmails } from '@/lib/email/service';

const target = {
  studentId: 'student-1', subjectId: 'subject-1', name: 'Synthetic Student',
  email: 'student@iiitdm.ac.in', subjectName: 'CS101', attendancePercentage: 80,
  threshold: 85, classesToRecover: 7, latestScore: 42, previousScore: 72,
  marksRisk: true, present: 16, total: 20,
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal('fetch', request);
  vi.stubEnv('DEMO_LIVE_AUTOMATIONS', 'false');
  vi.stubEnv('DEMO_AUTOMATION_EMAIL', 'judge-test@example.com');
  vi.stubEnv('RESEND_API_KEY', 'test-key');
  vi.stubEnv('RESEND_FROM_EMAIL', 'Alerts <alerts@example.com>');
  integrationQuery.mockResolvedValue([target]);
  integrationMutation.mockImplementation(async (name: string) => name === 'claimNotification' ? 'event-1' : undefined);
  request.mockResolvedValue({ ok: true });
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe('public-demo warning email safety', () => {
  it('simulates by default even with Resend credentials', async () => {
    await expect(dispatchRiskEmails('professor@iiitdm.ac.in')).resolves.toMatchObject({ simulated: 1, sent: 0 });
    expect(request).not.toHaveBeenCalled();
  });
  it('live mode uses only the pinned inbox and fixed synthetic content', async () => {
    vi.stubEnv('DEMO_LIVE_AUTOMATIONS', 'true');
    await expect(dispatchRiskEmails('professor@iiitdm.ac.in')).resolves.toMatchObject({ sent: 1 });
    const payload = JSON.parse(request.mock.calls[0][1].body);
    expect(payload.to).toEqual(['judge-test@example.com']);
    expect(payload.text).not.toContain(target.name);
    expect(payload.text).not.toContain(target.email);
    expect(payload.text).not.toContain('16/20');
    expect(request.mock.calls[0][1].headers['Idempotency-Key']).toContain('resend-live:public-demo:');
  });
  it('refuses live delivery without a pinned inbox', async () => {
    vi.stubEnv('DEMO_LIVE_AUTOMATIONS', 'true');
    vi.stubEnv('DEMO_AUTOMATION_EMAIL', '');
    await expect(dispatchRiskEmails('professor@iiitdm.ac.in')).resolves.toMatchObject({ sent: 0, skipped: 1 });
    expect(request).not.toHaveBeenCalled();
  });
  it('skips a previously claimed daily notification', async () => {
    vi.stubEnv('DEMO_LIVE_AUTOMATIONS', 'true');
    integrationMutation.mockResolvedValue(null);
    await expect(dispatchRiskEmails('professor@iiitdm.ac.in')).resolves.toMatchObject({ skipped: 1 });
    expect(request).not.toHaveBeenCalled();
  });
});
