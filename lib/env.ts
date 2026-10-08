/**
 * Server-side environment access and configuration guards.
 * Never import this from a client component.
 */

export const STUDENT_EMAIL_DOMAIN = 'iiitdm.ac.in';

function clean(value: string | undefined | null): string {
  return (value ?? '').trim();
}

/** Exact, config-driven professor/admin address (never inferred from the domain). */
export function getProfessorEmail(): string {
  return clean(process.env.PROFESSOR_EMAIL).toLowerCase();
}

export function isProfessorEmail(email: string | null | undefined): boolean {
  const target = getProfessorEmail();
  if (!target || !email) return false;
  return email.trim().toLowerCase() === target;
}

export function isStudentDomainEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return email.trim().toLowerCase().endsWith(`@${STUDENT_EMAIL_DOMAIN}`);
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isDbConfigured(): boolean {
  return Boolean(clean(process.env.DATABASE_URL));
}

export function getCalendarTimeZone(): string {
  return clean(process.env.CALENDAR_TIMEZONE) || 'Asia/Kolkata';
}

export interface ClockTime {
  hour: number;
  minute: number;
}

function parseClock(value: string | undefined, fallback: ClockTime): ClockTime {
  const match = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(clean(value));
  if (!match) return fallback;
  return { hour: Number(match[1]), minute: Number(match[2]) };
}

export function getWorkdayStart(): ClockTime {
  return parseClock(process.env.CALENDAR_WORKDAY_START, { hour: 9, minute: 0 });
}

export function getWorkdayEnd(): ClockTime {
  return parseClock(process.env.CALENDAR_WORKDAY_END, { hour: 17, minute: 0 });
}

export function getSlotMinutes(): number {
  const value = Number(clean(process.env.CALENDAR_SLOT_MINUTES));
  if (!Number.isFinite(value) || value < 5 || value > 240) return 30;
  return Math.floor(value);
}

export function getMinBookingMinutes(): number {
  const value = Number(clean(process.env.CALENDAR_MIN_BOOKING_MINUTES));
  if (!Number.isFinite(value) || value < 5) return 20;
  return Math.floor(value);
}

export function getMaxBookingMinutes(): number {
  const value = Number(clean(process.env.CALENDAR_MAX_BOOKING_MINUTES));
  if (!Number.isFinite(value) || value < 5) return 30;
  return Math.floor(value);
}
