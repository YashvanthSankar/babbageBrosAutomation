import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { session, claim, dispatch } = vi.hoisted(() => ({ session: vi.fn(), claim: vi.fn(), dispatch: vi.fn() }));
vi.mock('@/lib/session', () => ({ getSession: session, requireAdmin: (value: unknown) => value, sessionEmail: () => 'professor@iiitdm.ac.in' }));
vi.mock('@/lib/integrations-store', () => ({ integrationMutation: claim }));
vi.mock('@/lib/email/demo', () => ({ DEMO_ATTENDANCE_PERCENTAGE: 69, dispatchDemoAttendanceEmail: dispatch,
  EmailDispatchError: class extends Error {}, EmailNotConfiguredError: class extends Error {},
  isEmailAddress: (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value), normalizeRecipient: (value: string) => value.trim().toLowerCase() }));
import { POST } from '@/app/api/email/demo-send/route';

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('DEMO_LIVE_AUTOMATIONS','false');
  vi.stubEnv('DEMO_AUTOMATION_EMAIL','consenting@example.com');
  vi.stubEnv('RESEND_API_KEY','test-key');
  vi.stubEnv('RESEND_FROM_EMAIL','Demo <demo@example.com>');
  session.mockResolvedValue({user:{email:'professor@iiitdm.ac.in'}});
  claim.mockImplementation(async (name:string) => name === 'claimAggregate' ? 'id' : undefined);
});
afterEach(() => vi.unstubAllEnvs());
const request = (body: unknown) => new Request('http://localhost/api/email/demo-send',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}) as never;

describe('manual demo email route safety', () => {
  it('rejects an arbitrary request-body recipient without claiming or sending', async () => {
    const response=await POST(request({email:'stranger@example.com'}));
    expect(response.status).toBe(422);
    expect(claim).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
  });
  it('simulates by default without a provider call', async () => {
    const response=await POST(request({}));
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({email:{simulated:true,dispatched:false}});
    expect(claim).toHaveBeenCalledWith('finishAggregate',expect.objectContaining({status:'simulated'}));
    expect(dispatch).not.toHaveBeenCalled();
  });
  it('respects the durable daily claim', async () => {
    claim.mockResolvedValue(null);
    expect((await POST(request({}))).status).toBe(429);
    expect(dispatch).not.toHaveBeenCalled();
  });
  it('live mode only dispatches to the server-pinned recipient', async () => {
    vi.stubEnv('DEMO_LIVE_AUTOMATIONS','true');
    const response=await POST(request({}));
    expect(response.status).toBe(201);
    expect(dispatch).toHaveBeenCalledWith({to:'consenting@example.com',attendancePercentage:69});
    expect(claim).toHaveBeenCalledWith('finishAggregate',expect.objectContaining({status:'dispatched'}));
  });
});
