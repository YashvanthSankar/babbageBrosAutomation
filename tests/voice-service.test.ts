import { beforeEach, describe, expect, it, vi } from 'vitest';

const { integrationQuery } = vi.hoisted(() => ({ integrationQuery: vi.fn() }));

vi.mock('@/lib/integrations-store', () => ({ integrationQuery }));

import { dispatchAtRiskAttendanceCall } from '@/lib/voice/service';

describe('synthetic roster voice calls', () => {
  beforeEach(() => integrationQuery.mockReset());

  it('returns a synthetic-data notice instead of dispatching an at-risk call', async () => {
    integrationQuery.mockResolvedValue([{
      studentId: 'student-1',
      subjectId: 'subject-1',
      phone: '+919876543210',
      attendancePercentage: 69,
      threshold: 85,
      present: 69,
      total: 100,
    }]);

    await expect(dispatchAtRiskAttendanceCall('student-1', 'subject-1', 'professor@iiitdm.ac.in'))
      .resolves.toEqual({ dispatched: false, status: 'synthetic_demo', attendancePercentage: 69 });
  });

  it('still reports when the selected student is not at risk', async () => {
    integrationQuery.mockResolvedValue([{
      studentId: 'student-1',
      subjectId: 'subject-1',
      phone: '+919876543210',
      attendancePercentage: 92,
      threshold: 85,
      present: 92,
      total: 100,
    }]);

    await expect(dispatchAtRiskAttendanceCall('student-1', 'subject-1', 'professor@iiitdm.ac.in'))
      .resolves.toEqual({ dispatched: false, status: 'not_at_risk', attendancePercentage: 92 });
  });
});
