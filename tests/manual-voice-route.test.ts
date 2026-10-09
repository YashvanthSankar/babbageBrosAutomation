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
    requireVerifiedProfessor: (value: { user: { verifiedProfessor?: boolean } }) => {
      if (value.user.verifiedProfessor !== true) throw new ApiError(403, 'VERIFIED_PROFESSOR_REQUIRED', 'Verify professor account');
      return value;
    },
    sessionEmail: () => 'professor@iiitdm.ac.in',
  };
});
vi.mock('@/lib/integrations-store', () => ({ integrationMutation: mutation }));
vi.mock('@/lib/voice/omnidim', () => ({
  dispatchAttendanceCall: dispatch,
  isIndianE164Phone: (value: string) => /^\+91[6-9]\d{9}$/.test(value),
  OmniDimensionDispatchError: class extends Error { constructor(readonly status: number, message: string) { super(message); } },
}));
import { POST } from '@/app/api/voice/demo-call/route';
import { OmniDimensionDispatchError } from '@/lib/voice/omnidim';

const request = (body: unknown) => new Request('http://localhost/api/voice/demo-call', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
}) as never;

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('DEMO_LIVE_AUTOMATIONS', 'false');
  vi.stubEnv('DEMO_LIVE_MANUAL_RECIPIENTS', 'false');
  vi.stubEnv('DEMO_AUTOMATION_PHONE', '+919876543210');
  vi.stubEnv('OMNIDIM_API_KEY', 'test-key');
  vi.stubEnv('OMNIDIM_AGENT_ID', '1');
  vi.stubEnv('OMNIDIM_FROM_NUMBER_ID', '2');
  session.mockResolvedValue({ user: { role: 'admin', email: 'professor@iiitdm.ac.in' } });
  mutation.mockImplementation(async (name: string) => name === 'claimAggregate' ? 'claim-id' : undefined);
});
afterEach(() => vi.unstubAllEnvs());

describe('manual demo voice route safety', () => {
  it('requires an authenticated professor before any claim or call', async () => {
    session.mockResolvedValueOnce(null);
    expect((await POST(request({}))).status).toBe(401);
    session.mockResolvedValueOnce({ user: { role: 'student' } });
    expect((await POST(request({}))).status).toBe(403);
    expect(mutation).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('simulates another entered number, never calling it in public mode', async () => {
    const response = await POST(request({ phone: '+919000000001' }));
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ call: { simulated: true, dispatched: false } });
    expect(dispatch).not.toHaveBeenCalled();
    expect(mutation).toHaveBeenCalledWith('claimAggregate',expect.objectContaining({key:expect.stringMatching(/^manual-voice-simulation:/)}));
  });

  it('simulates by default and records an aggregate event', async () => {
    const response = await POST(request({ phone: '+919876543210' }));
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({ call: { simulated: true, dispatched: false, attendancePercentage: 69 } });
    expect(mutation).toHaveBeenCalledWith('finishAggregate', expect.objectContaining({ status: 'simulated' }));
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('does not send again after a daily claim', async () => {
    mutation.mockResolvedValue(null);
    expect((await POST(request({}))).status).toBe(429);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('dispatches only to the pinned number with fixed content in live mode', async () => {
    vi.stubEnv('DEMO_LIVE_AUTOMATIONS', 'true');
    const response = await POST(request({ phone: '+919876543210' }));
    expect(response.status).toBe(201);
    expect(dispatch).toHaveBeenCalledWith({ toNumber: '+919876543210', attendancePercentage: 69 });
    expect(mutation).toHaveBeenCalledWith('finishAggregate', expect.objectContaining({ status: 'dispatched' }));
  });

  it('still rejects an entered live number when manual recipient delivery is off', async () => {
    vi.stubEnv('DEMO_LIVE_AUTOMATIONS', 'true');
    expect((await POST(request({ phone: '+919000000001' }))).status).toBe(422);
    expect(mutation).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('requires verified Google faculty and explicit consent for entered live calls', async () => {
    vi.stubEnv('DEMO_LIVE_AUTOMATIONS', 'true');
    vi.stubEnv('DEMO_LIVE_MANUAL_RECIPIENTS', 'true');
    expect((await POST(request({ phone: '+919000000001', consentConfirmed: true }))).status).toBe(403);
    session.mockResolvedValue({ user: { role: 'admin', verifiedProfessor: true } });
    expect((await POST(request({ phone: '+919000000001' }))).status).toBe(422);
    expect(mutation).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('sends to the entered number only after verified faculty consent and claim', async () => {
    vi.stubEnv('DEMO_LIVE_AUTOMATIONS', 'true');
    vi.stubEnv('DEMO_LIVE_MANUAL_RECIPIENTS', 'true');
    session.mockResolvedValue({ user: { role: 'admin', verifiedProfessor: true } });
    const response = await POST(request({ phone: '+919000000001', consentConfirmed: true }));
    expect(response.status).toBe(201);
    expect(dispatch).toHaveBeenCalledWith({ toNumber: '+919000000001', attendancePercentage: 69 });
    expect(mutation).toHaveBeenCalledWith('claimAggregate', expect.objectContaining({ key: expect.stringMatching(/^manual-voice-live:/), legacyKey: expect.stringMatching(/^manual-voice:/) }));
    expect(mutation).toHaveBeenCalledWith('finishAggregate', expect.objectContaining({ status: 'dispatched' }));
  });

  it('rejects live mode without an approved number before claiming a daily attempt', async () => {
    vi.stubEnv('DEMO_LIVE_AUTOMATIONS', 'true');
    vi.stubEnv('DEMO_AUTOMATION_PHONE', '');
    expect((await POST(request({}))).status).toBe(503);
    expect(mutation).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('records a failed attempt when the provider rejects a request', async () => {
    vi.stubEnv('DEMO_LIVE_AUTOMATIONS', 'true');
    dispatch.mockRejectedValueOnce(new OmniDimensionDispatchError(502, 'Provider unavailable'));
    expect((await POST(request({}))).status).toBe(502);
    expect(mutation).toHaveBeenCalledWith('finishAggregate', expect.objectContaining({ status: 'failed' }));
  });
});
