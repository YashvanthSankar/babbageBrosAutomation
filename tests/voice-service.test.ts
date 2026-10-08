import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { integrationQuery, integrationMutation, dispatchAttendanceCall } = vi.hoisted(() => ({
  integrationQuery: vi.fn(),
  integrationMutation: vi.fn(),
  dispatchAttendanceCall: vi.fn(),
}));

vi.mock('@/lib/integrations-store', () => ({ integrationQuery, integrationMutation }));
vi.mock('@/lib/voice/omnidim', () => ({
  dispatchAttendanceCall,
  isIndianE164Phone: (phone: string) => /^\+91\d{10}$/.test(phone),
}));

import { dispatchAtRiskAttendanceCall } from '@/lib/voice/service';

const target = {
  studentId: 'student-1',
  subjectId: 'subject-1',
  phone: '+919876543210',
  attendancePercentage: 69,
  threshold: 85,
  present: 69,
  total: 100,
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('DEMO_LIVE_AUTOMATIONS', 'false');
  vi.stubEnv('DEMO_AUTOMATION_PHONE', '+919999999999');
  vi.stubEnv('OMNIDIM_API_KEY', 'test-key');
  vi.stubEnv('OMNIDIM_AGENT_ID', 'agent');
  vi.stubEnv('OMNIDIM_FROM_NUMBER_ID', 'number');
  integrationQuery.mockResolvedValue([target]);
  integrationMutation.mockImplementation(async (name: string) => name === 'claimNotification' ? 'event-1' : undefined);
  dispatchAttendanceCall.mockResolvedValue(undefined);
});

afterEach(() => vi.unstubAllEnvs());

describe('public-demo voice safety', () => {
  it('records a simulation by default and never calls the roster phone', async () => {
    await expect(dispatchAtRiskAttendanceCall('student-1', 'subject-1', 'professor@iiitdm.ac.in'))
      .resolves.toMatchObject({ dispatched: false, status: 'simulated', attendancePercentage: 69 });
    expect(dispatchAttendanceCall).not.toHaveBeenCalled();
    expect(integrationMutation).toHaveBeenCalledWith('finishNotification', { id: 'event-1', status: 'simulated' });
  });

  it('live mode calls only the pinned test number with fixed synthetic context', async () => {
    vi.stubEnv('DEMO_LIVE_AUTOMATIONS', 'true');
    await expect(dispatchAtRiskAttendanceCall('student-1', 'subject-1', 'professor@iiitdm.ac.in'))
      .resolves.toMatchObject({ dispatched: true, status: 'dispatched', attendancePercentage: 69 });
    expect(dispatchAttendanceCall).toHaveBeenCalledWith({ toNumber: '+919999999999', attendancePercentage: 80 });
    expect(dispatchAttendanceCall).not.toHaveBeenCalledWith(expect.objectContaining({ toNumber: target.phone }));
    expect(integrationMutation).toHaveBeenCalledWith('claimNotification', expect.objectContaining({
      key: expect.stringContaining('omnidim-live:public-demo:'),
      provider: 'omnidim_voice',
    }));
  });

  it('does not place another call when the daily provider claim already exists', async () => {
    vi.stubEnv('DEMO_LIVE_AUTOMATIONS', 'true');
    integrationMutation.mockResolvedValue(null);
    await expect(dispatchAtRiskAttendanceCall('student-1', 'subject-1', 'professor@iiitdm.ac.in'))
      .resolves.toMatchObject({ dispatched: false, status: 'duplicate' });
    expect(dispatchAttendanceCall).not.toHaveBeenCalled();
  });

  it('does not call a student who is not currently below threshold', async () => {
    integrationQuery.mockResolvedValue([{ ...target, attendancePercentage: 92 }]);
    await expect(dispatchAtRiskAttendanceCall('student-1', 'subject-1', 'professor@iiitdm.ac.in'))
      .resolves.toMatchObject({ dispatched: false, status: 'not_at_risk' });
    expect(dispatchAttendanceCall).not.toHaveBeenCalled();
  });
});
