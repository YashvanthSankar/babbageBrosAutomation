/**
 * OmniDimension call-dispatch client. Server-only: this module must never be
 * imported by a client component or expose its bearer token to the browser.
 */

const DISPATCH_URL = 'https://backend.omnidim.io/api/v1/calls/dispatch';

export class OmniDimensionNotConfiguredError extends Error {
  constructor() {
    super('Voice calling is not configured. Set OMNIDIM_API_KEY, OMNIDIM_AGENT_ID, and OMNIDIM_FROM_NUMBER_ID on the server.');
    this.name = 'OmniDimensionNotConfiguredError';
  }
}

export class OmniDimensionDispatchError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'OmniDimensionDispatchError';
    this.status = status;
  }
}

export interface OmniDimensionDispatchInput {
  toNumber: string;
  attendancePercentage: number;
}

function env(name: string): string {
  return (process.env[name] ?? '').trim();
}

/** International E.164 number: a leading + then 2–15 digits with no leading zero. */
export function isE164Phone(value: string): boolean {
  return /^\+[1-9]\d{1,14}$/.test(value.trim());
}

/** India mobile number in E.164: +91 followed by a 10-digit 6–9 prefix number.
 * Import automation keeps this stricter check for pinned demo calls. */
export function isIndianE164Phone(value: string): boolean {
  return /^\+91[6-9]\d{9}$/.test(value.trim());
}

function configured(): { apiKey: string; agentId: number; fromNumberId: number } {
  const apiKey = env('OMNIDIM_API_KEY');
  const agentId = Number(env('OMNIDIM_AGENT_ID'));
  const fromNumberId = Number(env('OMNIDIM_FROM_NUMBER_ID'));
  if (!apiKey || !Number.isInteger(agentId) || agentId <= 0 || !Number.isInteger(fromNumberId) || fromNumberId <= 0) {
    throw new OmniDimensionNotConfiguredError();
  }
  return { apiKey, agentId, fromNumberId };
}

/** Dispatch one call. The provider response deliberately is not logged verbatim. */
export async function dispatchAttendanceCall(input: OmniDimensionDispatchInput): Promise<void> {
  const toNumber = input.toNumber.trim();
  if (!isE164Phone(toNumber)) {
    throw new OmniDimensionDispatchError(422, 'The phone number must be a valid international E.164 number (for example +14155552671).');
  }
  if (!Number.isFinite(input.attendancePercentage) || input.attendancePercentage < 0 || input.attendancePercentage > 100) {
    throw new OmniDimensionDispatchError(422, 'Attendance percentage must be between 0 and 100.');
  }

  const { apiKey, agentId, fromNumberId } = configured();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(DISPATCH_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        agent_id: agentId,
        from_number_id: fromNumberId,
        to_number: toNumber,
        call_context: {
          attendance_percentage: input.attendancePercentage.toFixed(1),
        },
      }),
      cache: 'no-store',
      signal: controller.signal,
    });
    if (!response.ok) {
      // Do not relay provider response text: it could include operational or PII details.
      throw new OmniDimensionDispatchError(response.status, 'The voice provider could not dispatch the call.');
    }
  } catch (error) {
    if (error instanceof OmniDimensionDispatchError) throw error;
    if (error instanceof Error && error.name === 'AbortError') {
      throw new OmniDimensionDispatchError(504, 'The voice provider timed out while dispatching the call.');
    }
    throw new OmniDimensionDispatchError(502, 'The voice provider could not be reached.');
  } finally {
    clearTimeout(timeout);
  }
}
