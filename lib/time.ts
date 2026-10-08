/**
 * Time-zone and interval helpers.
 *
 * Slots are generated in the professor's configured IANA time zone
 * (CALENDAR_TIMEZONE, default Asia/Kolkata) and serialized as ISO UTC.
 */

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

export function isValidIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function partsInTimeZone(date: Date, timeZone: string): Record<string, number> {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const map: Record<string, number> = {};
  for (const part of formatter.formatToParts(date)) {
    if (part.type !== 'literal') map[part.type] = Number(part.value);
  }
  return map;
}

function getOffsetMs(date: Date, timeZone: string): number {
  const p = partsInTimeZone(date, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - date.getTime();
}

/** Convert a wall-clock date/time in `timeZone` to the corresponding UTC instant. */
export function zonedDateTimeToUtc(
  dateStr: string,
  hour: number,
  minute: number,
  timeZone: string,
): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  const guess = Date.UTC(year, month - 1, day, hour, minute, 0, 0);
  const offset = getOffsetMs(new Date(guess), timeZone);
  return new Date(guess - offset);
}

function addDays(dateStr: string, days: number): string {
  const [year, month, day] = dateStr.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day + days));
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

export function dayBoundsUtc(dateStr: string, timeZone: string): { start: Date; end: Date } {
  return {
    start: zonedDateTimeToUtc(dateStr, 0, 0, timeZone),
    end: zonedDateTimeToUtc(addDays(dateStr, 1), 0, 0, timeZone),
  };
}

export function intervalsOverlap(
  aStartMs: number,
  aEndMs: number,
  bStartMs: number,
  bEndMs: number,
): boolean {
  return aStartMs < bEndMs && bStartMs < aEndMs;
}

export function minutesBetween(startMs: number, endMs: number): number {
  return Math.round((endMs - startMs) / 60_000);
}

export function parseInstant(value: unknown): Date | null {
  if (typeof value !== 'string' || value.trim() === '') return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}
