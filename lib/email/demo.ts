/**
 * Professor demo email dispatch with fixed synthetic attendance context.
 * Server-only: this module must never be imported by a client component or
 * expose RESEND_API_KEY to the browser. It performs no roster lookup and
 * touches no student contact data.
 */

const SEND_URL = 'https://api.resend.com/emails';
const TIMEOUT_MS = 10_000;
/** Fixed showcase percentage; the demo never derives a value from real data. */
export const DEMO_ATTENDANCE_PERCENTAGE = 69;

export class EmailNotConfiguredError extends Error {
  constructor() {
    super('Email sending is not configured. Set RESEND_API_KEY and RESEND_FROM_EMAIL on the server.');
    this.name = 'EmailNotConfiguredError';
  }
}

export class EmailDispatchError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'EmailDispatchError';
    this.status = status;
  }
}

export interface DemoEmailInput {
  to: string;
  attendancePercentage: number;
}

function env(name: string): string {
  return (process.env[name] ?? '').trim();
}

/** Syntactically valid single recipient address. */
export function isEmailAddress(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

/** Lowercase, trimmed form used for validation and rate-limit keying. */
export function normalizeRecipient(value: string): string {
  return value.trim().toLowerCase();
}

/** Resend's sandbox sender is limited to the account owner's inbox. */
export function resendSandboxSender(from: string): boolean {
  return /(?:^|<)onboarding@resend\.dev>?\s*$/i.test(from.trim());
}

function configured(): { apiKey: string; from: string } {
  const apiKey = env('RESEND_API_KEY');
  const from = env('RESEND_FROM_EMAIL');
  if (!apiKey || !from) throw new EmailNotConfiguredError();
  return { apiKey, from };
}

function demoBody(attendancePercentage: number): string {
  return [
    'This is a synthetic demo email from the professor demo-send endpoint.',
    'It does not reference any real student, roster or contact.',
    '',
    `Example attendance context: ${attendancePercentage}%.`,
    '',
    'No student data was used to produce this message.',
  ].join('\n');
}

/**
 * Low-level Resend adapter. Caller must enforce the selected recipient mode,
 * verified faculty identity for an entered live address, and a Convex-backed
 * daily claim; never invoke directly from an unauthenticated request body.
 * The provider response body is never relayed verbatim.
 */
export async function dispatchDemoAttendanceEmail(input: DemoEmailInput): Promise<{ id: string | null }> {
  const to = normalizeRecipient(input.to);
  if (!isEmailAddress(to)) {
    throw new EmailDispatchError(422, 'Enter a valid email address.');
  }
  if (!Number.isFinite(input.attendancePercentage) || input.attendancePercentage < 0 || input.attendancePercentage > 100) {
    throw new EmailDispatchError(422, 'Attendance percentage must be between 0 and 100.');
  }

  const { apiKey, from } = configured();
  try {
    const response = await fetch(SEND_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [to],
        subject: `[Synthetic demo] Attendance context ${input.attendancePercentage}%`,
        text: demoBody(input.attendancePercentage),
      }),
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) {
      // Do not relay provider response text: it could include operational details.
      throw new EmailDispatchError(response.status, 'The email provider could not send the demo email.');
    }
    let id: string | null = null;
    try {
      const payload = (await response.json()) as { id?: unknown } | null;
      if (payload && typeof payload.id === 'string') id = payload.id;
    } catch {
      // A non-JSON success body is acceptable; the send still succeeded.
    }
    return { id };
  } catch (error) {
    if (error instanceof EmailDispatchError) throw error;
    if (error instanceof Error && error.name === 'AbortError') {
      throw new EmailDispatchError(504, 'The email provider timed out while sending the demo email.');
    }
    throw new EmailDispatchError(502, 'The email provider could not be reached.');
  }
}
