import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

const { query, mutation, request } = vi.hoisted(() => ({ query: vi.fn(), mutation: vi.fn(), request: vi.fn() }));
vi.mock('@/lib/integrations-store', () => ({ integrationQuery: query, integrationMutation: mutation }));
import { isoWeek, runWeeklySummary, weeklyReadiness } from '@/lib/email/weekly';

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal('fetch', request);
  vi.stubEnv('DEMO_LIVE_AUTOMATIONS', 'false');
  vi.stubEnv('DEMO_AUTOMATION_EMAIL', 'consenting@example.com');
  vi.stubEnv('FACULTY_ADVISER_EMAIL', 'consenting@example.com');
  vi.stubEnv('RESEND_API_KEY', 'test-key');
  vi.stubEnv('RESEND_FROM_EMAIL', 'Demo <demo@example.com>');
  query.mockResolvedValue({ totalStudents: 10, atRiskStudents: 3, subjects: 2 });
  mutation.mockImplementation(async (name: string, args: {kind?: string}) => name === 'claimAggregate' ? `claim-${args.kind}` : undefined);
  request.mockResolvedValue({ ok: true });
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe('weekly summary and adviser alert', () => {
  const professor = 'professor@iiitdm.ac.in';
  it('uses ISO week-year across year boundaries', () => {
    expect(isoWeek(new Date('2021-01-01T23:59:00Z'))).toBe('2020-W53');
    expect(isoWeek(new Date('2026-10-09T10:00:00Z'))).toBe('2026-W41');
  });
  it('simulates both aggregate actions by default and claims once per week', async () => {
    const result = await runWeeklySummary(professor, new Date('2026-10-09T10:00:00Z'));
    expect(result).toEqual({week:'2026-W41',counts:{totalStudents:10,atRiskStudents:3,subjects:2},results:{weekly_summary:'simulated',adviser_alert:'simulated'}});
    expect(request).not.toHaveBeenCalled();
    expect(mutation).toHaveBeenCalledWith('claimAggregate', expect.objectContaining({key:'weekly_summary:2026-W41',totalStudents:10,atRiskStudents:3}));
  });
  it('never sends an adviser alert when no student is at risk', async () => {
    query.mockResolvedValue({ totalStudents: 10, atRiskStudents: 0, subjects: 2 });
    expect((await runWeeklySummary(professor)).results.adviser_alert).toBe('not_applicable');
    expect(mutation).toHaveBeenCalledTimes(2);
  });
  it('only sends fixed synthetic content to the pinned inbox in opt-in live mode', async () => {
    vi.stubEnv('DEMO_LIVE_AUTOMATIONS', 'true');
    const result = await runWeeklySummary(professor);
    expect(result.results).toEqual({weekly_summary:'provider_accepted',adviser_alert:'provider_accepted'});
    expect(request).toHaveBeenCalledTimes(2);
    for (const [,init] of request.mock.calls as [string, RequestInit][]) {
      const body = JSON.parse(String(init.body));
      expect(body.to).toEqual(['consenting@example.com']);
      expect(JSON.stringify(body)).not.toContain('10');
      expect(JSON.stringify(body)).not.toContain('professor@iiitdm.ac.in');
    }
  });
  it('simulates adviser when adviser address differs from pinned consenting inbox', async () => {
    vi.stubEnv('DEMO_LIVE_AUTOMATIONS','true');
    vi.stubEnv('FACULTY_ADVISER_EMAIL','unapproved@example.com');
    expect(weeklyReadiness().liveAdviserAllowed).toBe(false);
    const result = await runWeeklySummary(professor);
    expect(result.results.adviser_alert).toBe('simulated');
    expect(request).toHaveBeenCalledTimes(1);
  });
  it('does not resend on an already-claimed week, even after a failed provider call', async () => {
    mutation.mockResolvedValue(null);
    const result = await runWeeklySummary(professor);
    expect(result.results).toEqual({weekly_summary:'already_run',adviser_alert:'already_run'});
    expect(request).not.toHaveBeenCalled();
  });
  it('records failure rather than claiming delivery when Resend rejects', async () => {
    vi.stubEnv('DEMO_LIVE_AUTOMATIONS','true');
    request.mockResolvedValue({ok:false});
    expect((await runWeeklySummary(professor)).results).toEqual({weekly_summary:'failed',adviser_alert:'failed'});
    expect(mutation).toHaveBeenCalledWith('finishAggregate',expect.objectContaining({status:'failed'}));
  });
});
