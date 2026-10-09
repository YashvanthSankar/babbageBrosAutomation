import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { session, claim, dispatch } = vi.hoisted(() => ({ session: vi.fn(), claim: vi.fn(), dispatch: vi.fn() }));
vi.mock('@/lib/session', async () => {
  const { ApiError } = await import('@/lib/api');
  return {
    getSession: session,
    requireAdmin: (value: { user?: { role?: string } } | null) => {
      if (!value?.user) throw new ApiError(401, 'UNAUTHENTICATED', 'Sign in required');
      if (value.user.role !== 'admin') throw new ApiError(403, 'FORBIDDEN', 'Admin only');
      return value;
    },
    sessionEmail: () => 'professor@iiitdm.ac.in',
  };
});
vi.mock('@/lib/integrations-store', () => ({ integrationMutation: claim }));
vi.mock('@/lib/email/demo', () => ({
  DEMO_ATTENDANCE_PERCENTAGE: 69,
  dispatchDemoAttendanceEmail: dispatch,
  EmailDispatchError: class EmailDispatchError extends Error {
    constructor(readonly status: number, message: string) { super(message); }
  },
  EmailNotConfiguredError: class EmailNotConfiguredError extends Error {
    constructor() { super('Email sending is not configured.'); }
  },
  isEmailAddress: (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()),
  normalizeRecipient: (value: string) => value.trim().toLowerCase(),
}));
import { POST } from '@/app/api/email/demo-send/route';
import { EmailDispatchError, EmailNotConfiguredError } from '@/lib/email/demo';

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('DEMO_LIVE_AUTOMATIONS', 'false');
  vi.stubEnv('DEMO_LIVE_MANUAL_RECIPIENTS', 'false');
  vi.stubEnv('DEMO_AUTOMATION_EMAIL', 'consenting@example.com');
  session.mockResolvedValue({ user: { role: 'admin', email: 'professor@iiitdm.ac.in' } });
  claim.mockImplementation(async (name: string) => (name === 'claimAggregate' ? 'id' : undefined));
  dispatch.mockResolvedValue({ id: 'email-abc' });
});
afterEach(() => vi.unstubAllEnvs());
const request = (body: unknown) => new Request('http://localhost/api/email/demo-send', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) as never;

describe('manual demo email route safety', () => {
  it('requires an authenticated professor before any claim or send', async () => {
    session.mockResolvedValueOnce(null);
    expect((await POST(request({ email: 'anyone@example.com' }))).status).toBe(401);
    session.mockResolvedValueOnce({ user: { role: 'student' } });
    expect((await POST(request({ email: 'anyone@example.com' }))).status).toBe(403);
    expect(claim).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('rejects a missing or invalid entered email before claiming', async () => {
    expect((await POST(request({}))).status).toBe(422);
    expect((await POST(request({ email: '   ' }))).status).toBe(422);
    expect((await POST(request({ email: 'not-an-email' }))).status).toBe(422);
    expect((await POST(request({ email: 'a@example.com,b@example.com' }))).status).toBe(422);
    expect(claim).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('dispatches the entered address even with every demo flag disabled', async () => {
    const response = await POST(request({ email: ' Stranger@Example.com ' }));
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ email: { dispatched: true, attendancePercentage: 69 } });
    expect(dispatch).toHaveBeenCalledWith({ to: 'stranger@example.com', attendancePercentage: 69 });
    expect(claim).toHaveBeenCalledWith('claimAggregate', expect.objectContaining({
      kind: 'manual_demo_email',
      key: expect.stringMatching(/^manual-demo-live:/),
      legacyKey: expect.stringMatching(/^manual-demo:/),
    }));
    expect(claim).toHaveBeenCalledWith('finishAggregate', expect.objectContaining({ status: 'dispatched' }));
  });

  it('succeeds for an ordinary unverified professor without any consent attestation', async () => {
    session.mockResolvedValue({ user: { role: 'admin', email: 'professor@iiitdm.ac.in' } });
    const response = await POST(request({ email: 'student@example.com' }));
    expect(response.status).toBe(201);
    expect(dispatch).toHaveBeenCalledWith({ to: 'student@example.com', attendancePercentage: 69 });
  });

  it('returns 429 without dispatching when the durable daily claim is exhausted', async () => {
    claim.mockResolvedValue(null);
    expect((await POST(request({ email: 'student@example.com' }))).status).toBe(429);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('records a failed attempt when the provider rejects the send', async () => {
    dispatch.mockRejectedValueOnce(new EmailDispatchError(500, 'Provider unavailable'));
    expect((await POST(request({ email: 'student@example.com' }))).status).toBe(502);
    expect(claim).toHaveBeenCalledWith('finishAggregate', expect.objectContaining({ status: 'failed' }));
  });

  it('records a failed attempt and returns 503 when the adapter is not configured', async () => {
    dispatch.mockRejectedValueOnce(new EmailNotConfiguredError());
    const response = await POST(request({ email: 'student@example.com' }));
    expect(response.status).toBe(503);
    expect(claim).toHaveBeenCalledWith('finishAggregate', expect.objectContaining({ status: 'failed' }));
  });
});
