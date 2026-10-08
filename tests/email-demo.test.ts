import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  DEMO_ATTENDANCE_PERCENTAGE,
  dispatchDemoAttendanceEmail,
  EmailDispatchError,
  EmailNotConfiguredError,
  isEmailAddress,
  normalizeRecipient,
} from '@/lib/email/demo';

const ORIGINAL_KEY = process.env.RESEND_API_KEY;
const ORIGINAL_FROM = process.env.RESEND_FROM_EMAIL;

function okResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('demo email dispatch', () => {
  beforeEach(() => {
    delete process.env.RESEND_API_KEY;
    delete process.env.RESEND_FROM_EMAIL;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    if (ORIGINAL_KEY === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = ORIGINAL_KEY;
    if (ORIGINAL_FROM === undefined) delete process.env.RESEND_FROM_EMAIL;
    else process.env.RESEND_FROM_EMAIL = ORIGINAL_FROM;
  });

  it('sends exactly one provider request to the entered address', async () => {
    process.env.RESEND_API_KEY = 'test-key';
    process.env.RESEND_FROM_EMAIL = 'Demo <demo@example.com>';
    const fetchMock = vi.fn().mockResolvedValue(okResponse({ id: 'email-abc' }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await dispatchDemoAttendanceEmail({
      to: 'Student@Example.com',
      attendancePercentage: DEMO_ATTENDANCE_PERCENTAGE,
    });

    expect(result).toEqual({ id: 'email-abc' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.resend.com/emails');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer test-key');
    expect(init.signal).toBeInstanceOf(AbortSignal);
    const body = JSON.parse(String(init.body)) as { from: string; to: string[]; subject: string; text: string };
    expect(body.from).toBe('Demo <demo@example.com>');
    expect(body.to).toEqual(['student@example.com']);
    expect(body.subject).toContain('69%');
    expect(body.text).toContain('69%');
    expect(body.subject.toLowerCase()).toContain('synthetic');
    expect(JSON.stringify(body)).not.toContain('test-key');
  });

  it('reports missing configuration without calling the provider', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      dispatchDemoAttendanceEmail({ to: 'student@example.com', attendancePercentage: DEMO_ATTENDANCE_PERCENTAGE }),
    ).rejects.toBeInstanceOf(EmailNotConfiguredError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reports when only one of the credentials is missing', async () => {
    process.env.RESEND_API_KEY = 'test-key';
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      dispatchDemoAttendanceEmail({ to: 'student@example.com', attendancePercentage: DEMO_ATTENDANCE_PERCENTAGE }),
    ).rejects.toBeInstanceOf(EmailNotConfiguredError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('maps a provider failure to an EmailDispatchError without relaying provider text', async () => {
    process.env.RESEND_API_KEY = 'test-key';
    process.env.RESEND_FROM_EMAIL = 'demo@example.com';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('provider secret detail', { status: 500 })));

    const error = await dispatchDemoAttendanceEmail({
      to: 'student@example.com',
      attendancePercentage: DEMO_ATTENDANCE_PERCENTAGE,
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(EmailDispatchError);
    expect((error as EmailDispatchError).status).toBe(500);
    expect((error as EmailDispatchError).message).not.toContain('provider secret detail');
  });

  it('maps a provider timeout to a 504 dispatch error', async () => {
    process.env.RESEND_API_KEY = 'test-key';
    process.env.RESEND_FROM_EMAIL = 'demo@example.com';
    const abort = Object.assign(new Error('aborted'), { name: 'AbortError' });
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(abort));

    const error = await dispatchDemoAttendanceEmail({
      to: 'student@example.com',
      attendancePercentage: DEMO_ATTENDANCE_PERCENTAGE,
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(EmailDispatchError);
    expect((error as EmailDispatchError).status).toBe(504);
  });

  it('rejects a syntactically invalid recipient before any provider call', async () => {
    process.env.RESEND_API_KEY = 'test-key';
    process.env.RESEND_FROM_EMAIL = 'demo@example.com';
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    const error = await dispatchDemoAttendanceEmail({ to: 'not-an-email', attendancePercentage: DEMO_ATTENDANCE_PERCENTAGE })
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(EmailDispatchError);
    expect((error as EmailDispatchError).status).toBe(422);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('recipient normalization', () => {
  it('accepts syntactically valid addresses', () => {
    expect(isEmailAddress('student@example.com')).toBe(true);
    expect(isEmailAddress('  a.b+tag@iiitdm.ac.in ')).toBe(true);
  });

  it('rejects malformed addresses', () => {
    expect(isEmailAddress('not-an-email')).toBe(false);
    expect(isEmailAddress('a@b')).toBe(false);
    expect(isEmailAddress('a b@example.com')).toBe(false);
    expect(isEmailAddress('')).toBe(false);
  });

  it('lowercases and trims for validation and rate-limit keying', () => {
    expect(normalizeRecipient('  Student@Example.COM ')).toBe('student@example.com');
  });
});
