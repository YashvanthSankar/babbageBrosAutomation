import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { run } = vi.hoisted(() => ({ run: vi.fn() }));
vi.mock('@/lib/email/weekly', () => ({ runWeeklySummary: run }));
import { POST } from '@/app/api/automation/weekly/cron/route';

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv('CRON_SECRET','test-only-secret');
  vi.stubEnv('PROFESSOR_EMAIL','professor@iiitdm.ac.in');
  run.mockResolvedValue({week:'2026-W41'});
});
afterEach(() => vi.unstubAllEnvs());
const request = (value?: string) => new Request('http://localhost/api/automation/weekly/cron', {method:'POST',headers:value ? {authorization:value} : {}}) as never;

describe('scheduled weekly trigger', () => {
  it('rejects missing and incorrect bearer tokens before running', async () => {
    expect((await POST(request())).status).toBe(401);
    expect((await POST(request('Bearer wrong'))).status).toBe(401);
    expect(run).not.toHaveBeenCalled();
  });
  it('requires the server cron configuration', async () => {
    vi.stubEnv('CRON_SECRET','');
    expect((await POST(request('Bearer test-only-secret'))).status).toBe(503);
    expect(run).not.toHaveBeenCalled();
  });
  it('uses server professor identity, never a request body', async () => {
    const response=await POST(request('Bearer test-only-secret'));
    expect(response.status).toBe(200);
    expect(run).toHaveBeenCalledWith('professor@iiitdm.ac.in');
  });
});
