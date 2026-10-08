import { afterEach, describe, expect, it, vi } from 'vitest';
import { demoEmailRecipient, demoVoiceRecipient, liveDemoAutomationsEnabled, liveDemoDailyKey } from '@/lib/automation/mode';

afterEach(() => vi.unstubAllEnvs());

describe('public demo delivery safety', () => {
  it('defaults live provider delivery off', () => {
    vi.stubEnv('DEMO_LIVE_AUTOMATIONS', '');
    expect(liveDemoAutomationsEnabled()).toBe(false);
  });

  it('requires an explicit true opt-in', () => {
    vi.stubEnv('DEMO_LIVE_AUTOMATIONS', 'TRUE');
    expect(liveDemoAutomationsEnabled()).toBe(true);
    vi.stubEnv('DEMO_LIVE_AUTOMATIONS', '1');
    expect(liveDemoAutomationsEnabled()).toBe(false);
  });

  it('trims and normalizes server-pinned test recipients', () => {
    vi.stubEnv('DEMO_AUTOMATION_EMAIL', '  JudgeTest@example.com ');
    vi.stubEnv('DEMO_AUTOMATION_PHONE', ' +919000000001 ');
    expect(demoEmailRecipient()).toBe('judgetest@example.com');
    expect(demoVoiceRecipient()).toBe('+919000000001');
  });

  it('creates a provider-wide live-send cap key for a UTC calendar day', () => {
    const one = liveDemoDailyKey('resend-live', new Date('2026-10-08T01:00:00.000Z'));
    const another = liveDemoDailyKey('resend-live', new Date('2026-10-08T22:59:00.000Z'));
    const nextDay = liveDemoDailyKey('resend-live', new Date('2026-10-09T00:00:00.000Z'));
    expect(one).toBe(another);
    expect(nextDay).not.toBe(one);
  });
});
