import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { session, claim, dispatch } = vi.hoisted(() => ({ session: vi.fn(), claim: vi.fn(), dispatch: vi.fn() }));
vi.mock('@/lib/session', async () => {
  const { ApiError } = await import('@/lib/api');
  return { getSession: session, requireAdmin: (value: unknown) => value,
    requireVerifiedProfessor: (value: { user: { verifiedProfessor?: boolean } }) => {
      if (value.user.verifiedProfessor !== true) throw new ApiError(403, 'VERIFIED_PROFESSOR_REQUIRED', 'Verify professor account');
      return value;
    }, sessionEmail: () => 'professor@iiitdm.ac.in' };
});
vi.mock('@/lib/integrations-store', () => ({ integrationMutation: claim }));
vi.mock('@/lib/email/demo', () => ({ DEMO_ATTENDANCE_PERCENTAGE: 69, dispatchDemoAttendanceEmail: dispatch,
  EmailDispatchError: class extends Error {}, EmailNotConfiguredError: class extends Error {},
  isEmailAddress: (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value), normalizeRecipient: (value: string) => value.trim().toLowerCase(),
  resendSandboxSender: (value: string) => /onboarding@resend\.dev/i.test(value) }));
import { POST } from '@/app/api/email/demo-send/route';

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('DEMO_LIVE_AUTOMATIONS','false');
  vi.stubEnv('DEMO_LIVE_MANUAL_RECIPIENTS','false');
  vi.stubEnv('DEMO_AUTOMATION_EMAIL','consenting@example.com');
  vi.stubEnv('RESEND_API_KEY','test-key');
  vi.stubEnv('RESEND_FROM_EMAIL','Demo <demo@example.com>');
  session.mockResolvedValue({user:{email:'professor@iiitdm.ac.in'}});
  claim.mockImplementation(async (name:string) => name === 'claimAggregate' ? 'id' : undefined);
});
afterEach(() => vi.unstubAllEnvs());
const request = (body: unknown) => new Request('http://localhost/api/email/demo-send',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}) as never;

describe('manual demo email route safety', () => {
  it('simulates an entered email without claiming provider delivery', async () => {
    const response=await POST(request({email:'stranger@example.com'}));
    expect(response.status).toBe(201);
    expect(await response.json()).toMatchObject({email:{simulated:true,dispatched:false}});
    expect(dispatch).not.toHaveBeenCalled();
    expect(claim).toHaveBeenCalledWith('claimAggregate',expect.objectContaining({key:expect.stringMatching(/^manual-demo-simulation:/)}));
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
    const response=await POST(request({email:'Consenting@Example.com'}));
    expect(response.status).toBe(201);
    expect(dispatch).toHaveBeenCalledWith({to:'consenting@example.com',attendancePercentage:69});
    expect(claim).toHaveBeenCalledWith('finishAggregate',expect.objectContaining({status:'dispatched'}));
  });
  it('rejects other addresses even with live mode enabled', async () => {
    vi.stubEnv('DEMO_LIVE_AUTOMATIONS','true');
    expect((await POST(request({email:'someone-else@example.com'}))).status).toBe(422);
    expect(claim).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
  });
  it('requires verified Google faculty and consent for live entered recipients', async () => {
    vi.stubEnv('DEMO_LIVE_AUTOMATIONS','true');
    vi.stubEnv('DEMO_LIVE_MANUAL_RECIPIENTS','true');
    expect((await POST(request({email:'new@example.com',consentConfirmed:true}))).status).toBe(403);
    session.mockResolvedValue({user:{email:'professor@iiitdm.ac.in',verifiedProfessor:true}});
    expect((await POST(request({email:'new@example.com'}))).status).toBe(422);
    expect(claim).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
  });
  it('dispatches only the entered recipient after verified OAuth, consent and the durable claim', async () => {
    vi.stubEnv('DEMO_LIVE_AUTOMATIONS','true');
    vi.stubEnv('DEMO_LIVE_MANUAL_RECIPIENTS','true');
    session.mockResolvedValue({user:{email:'professor@iiitdm.ac.in',verifiedProfessor:true}});
    const response = await POST(request({email:'New@Example.com',consentConfirmed:true}));
    expect(response.status).toBe(201);
    expect(dispatch).toHaveBeenCalledWith({to:'new@example.com',attendancePercentage:69});
    expect(claim).toHaveBeenCalledWith('claimAggregate',expect.objectContaining({key:expect.stringMatching(/^manual-demo-live:/),legacyKey:expect.stringMatching(/^manual-demo:/)}));
    expect(claim).toHaveBeenCalledWith('finishAggregate',expect.objectContaining({status:'dispatched'}));
  });
  it('refuses an arbitrary inbox with the Resend sandbox sender before claiming or dispatching', async () => {
    vi.stubEnv('DEMO_LIVE_AUTOMATIONS','true');
    vi.stubEnv('DEMO_LIVE_MANUAL_RECIPIENTS','true');
    vi.stubEnv('RESEND_FROM_EMAIL','Student Success <onboarding@resend.dev>');
    session.mockResolvedValue({user:{email:'professor@iiitdm.ac.in',verifiedProfessor:true}});
    const response=await POST(request({email:'different@example.com',consentConfirmed:true}));
    expect(response.status).toBe(503);
    expect(claim).not.toHaveBeenCalled();
    expect(dispatch).not.toHaveBeenCalled();
  });
  it('rejects malformed or multiple entered addresses before claiming', async () => {
    expect((await POST(request({email:'a@example.com,b@example.com'}))).status).toBe(422);
    expect(claim).not.toHaveBeenCalled();
  });
});
