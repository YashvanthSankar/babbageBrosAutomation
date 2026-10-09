import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { session, mutation, dispatch } = vi.hoisted(() => ({ session: vi.fn(), mutation: vi.fn(), dispatch: vi.fn() }));
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
vi.mock('@/lib/integrations-store', () => ({ integrationMutation: mutation }));
vi.mock('@/lib/voice/omnidim', () => ({
  dispatchAttendanceCall: dispatch,
  isE164Phone: (value: string) => /^\+[1-9]\d{1,14}$/.test(value.trim()),
  OmniDimensionDispatchError: class OmniDimensionDispatchError extends Error {
    constructor(readonly status: number, message: string) { super(message); }
  },
  OmniDimensionNotConfiguredError: class OmniDimensionNotConfiguredError extends Error {
    constructor() { super('Voice calling is not configured.'); }
  },
}));
import { POST } from '@/app/api/voice/demo-call/route';
import { OmniDimensionDispatchError, OmniDimensionNotConfiguredError } from '@/lib/voice/omnidim';

const request = (body: unknown) => new Request('http://localhost/api/voice/demo-call', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
}) as never;

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('DEMO_LIVE_AUTOMATIONS', 'false');
  vi.stubEnv('DEMO_LIVE_MANUAL_RECIPIENTS', 'false');
  vi.stubEnv('DEMO_AUTOMATION_PHONE', '+919876543210');
  session.mockResolvedValue({ user: { role: 'admin', email: 'professor@iiitdm.ac.in' } });
  mutation.mockImplementation(async (name: string) => (name === 'claimAggregate' ? 'claim-id' : undefined));
  dispatch.mockResolvedValue(undefined);
});
afterEach(() => vi.unstubAllEnvs());

describe('manual demo voice route safety', () => {
  it('requires an authenticated professor before any claim or call', async () => {
    session.mockResolvedValueOnce(null);
    expect((await POST(request({ phone: '+14155550100' }))).status).toBe(401);
    session.mockResolvedValueOnce({ user: { role: 'student' } });
    expect((await POST(request({ phone: '+14155550100' }))).status).toBe(403);
    expect(mutation).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('rejects a missing or invalid entered number before claiming', async () => {
    expect((await POST(request({}))).status).toBe(422);
    expect((await POST(request({ phone: '9876543210' }))).status).toBe(422);
    expect((await POST(request({ phone: '+91 98765 43210' }))).status).toBe(422);
    expect((await POST(request({ phone: '+0123456789' }))).status).toBe(422);
    expect(mutation).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('dispatches the entered international number even with every demo flag disabled', async () => {
    const response = await POST(request({ phone: '+14155550100' }));
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ call: { dispatched: true, attendancePercentage: 69 } });
    expect(dispatch).toHaveBeenCalledWith({ toNumber: '+14155550100', attendancePercentage: 69 });
    expect(mutation).toHaveBeenCalledWith('claimAggregate', expect.objectContaining({
      kind: 'manual_demo_voice',
      key: expect.stringMatching(/^manual-voice-live:/),
      legacyKey: expect.stringMatching(/^manual-voice:/),
    }));
    expect(mutation).toHaveBeenCalledWith('finishAggregate', expect.objectContaining({ status: 'dispatched' }));
  });

  it('succeeds for an ordinary unverified professor without any consent attestation', async () => {
    const response = await POST(request({ phone: '+919876543210' }));
    expect(response.status).toBe(201);
    expect(dispatch).toHaveBeenCalledWith({ toNumber: '+919876543210', attendancePercentage: 69 });
  });

  it('returns 429 without dispatching when the durable daily claim is exhausted', async () => {
    mutation.mockResolvedValue(null);
    expect((await POST(request({ phone: '+14155550100' }))).status).toBe(429);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('records a failed attempt when the provider rejects the call', async () => {
    dispatch.mockRejectedValueOnce(new OmniDimensionDispatchError(502, 'Provider unavailable'));
    expect((await POST(request({ phone: '+14155550100' }))).status).toBe(502);
    expect(mutation).toHaveBeenCalledWith('finishAggregate', expect.objectContaining({ status: 'failed' }));
  });

  it('records a failed attempt and returns 503 when the adapter is not configured', async () => {
    dispatch.mockRejectedValueOnce(new OmniDimensionNotConfiguredError());
    const response = await POST(request({ phone: '+14155550100' }));
    expect(response.status).toBe(503);
    expect(mutation).toHaveBeenCalledWith('finishAggregate', expect.objectContaining({ status: 'failed' }));
  });
});
