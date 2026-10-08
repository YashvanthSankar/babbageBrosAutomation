/**
 * GET /api/calendar/slots?subjectId=...&date=YYYY-MM-DD
 *
 * Returns 30-minute candidate slots for the requested day in the professor's
 * time zone, serialized as ISO UTC. Availability combines the professor's
 * Google free/busy with existing local bookings.
 *
 * Honest fallback: if Google is not configured or the professor has not
 * connected the calendar, `calendarConnected` is false, `source` is "local",
 * and a `warning` explains the reduced accuracy.
 */
import type { NextRequest } from 'next/server';
import type { NextResponse } from 'next/server';
import { ApiError, handleRoute, json } from '@/lib/api';
import { query } from '@/lib/db';
import {
  getCalendarTimeZone,
  getSlotMinutes,
  getWorkdayEnd,
  getWorkdayStart,
  isProfessorEmail,
  normalizeEmail,
} from '@/lib/env';
import { isCalendarConfigured, queryFreeBusy } from '@/lib/google-calendar';
import { findStudentByEmail, findSubjectById } from '@/lib/roster';
import { getSession, requireSession, sessionEmail } from '@/lib/session';
import { dayBoundsUtc, intervalsOverlap, isValidIsoDate, zonedDateTimeToUtc } from '@/lib/time';
import { hasProfessorRefreshToken } from '@/lib/tokens';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface BusyIntervalMs {
  startMs: number;
  endMs: number;
}

interface Slot {
  start: string;
  end: string;
  available: boolean;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  return handleRoute(async () => {
    const session = requireSession(await getSession());
    const email = sessionEmail(session);

    const subjectId = Number(request.nextUrl.searchParams.get('subjectId'));
    const date = (request.nextUrl.searchParams.get('date') ?? '').trim();

    if (!Number.isInteger(subjectId) || subjectId <= 0) {
      throw new ApiError(400, 'INVALID_SUBJECT', 'subjectId must be a positive integer.');
    }
    if (!isValidIsoDate(date)) {
      throw new ApiError(400, 'INVALID_DATE', 'date must be a valid YYYY-MM-DD value.');
    }

    const subject = await findSubjectById(subjectId);
    if (!subject) {
      throw new ApiError(404, 'SUBJECT_NOT_FOUND', 'That subject does not exist.');
    }

    // Authorization: professor must own the subject; a student must be on the
    // roster of the subject's professor.
    if (session.user.role === 'admin') {
      if (!isProfessorEmail(email) || subject.professor_email !== normalizeEmail(email)) {
        throw new ApiError(403, 'FORBIDDEN', 'You do not own this subject.');
      }
    } else {
      const student = await findStudentByEmail(email);
      if (!student || student.professor_email !== subject.professor_email) {
        throw new ApiError(403, 'FORBIDDEN', 'You are not on this professor roster.');
      }
    }

    const timeZone = getCalendarTimeZone();
    const { start: dayStart, end: dayEnd } = dayBoundsUtc(date, timeZone);

    const localBookings = await query<{ starts_at: Date; ends_at: Date }>(
      `SELECT starts_at, ends_at
         FROM bookings
        WHERE professor_email = $1
          AND status IN ('pending', 'confirmed')
          AND starts_at < $3
          AND ends_at > $2`,
      [subject.professor_email, dayStart.toISOString(), dayEnd.toISOString()],
    );

    const busy: BusyIntervalMs[] = localBookings.rows.map((row) => ({
      startMs: new Date(row.starts_at).getTime(),
      endMs: new Date(row.ends_at).getTime(),
    }));

    let calendarConnected = false;
    let source: 'google' | 'local' = 'local';
    let warning: string | undefined;

    if (isCalendarConfigured() && (await hasProfessorRefreshToken(subject.professor_email))) {
      try {
        const googleBusy = await queryFreeBusy(
          subject.professor_email,
          dayStart.toISOString(),
          dayEnd.toISOString(),
        );
        for (const interval of googleBusy) {
          const startMs = new Date(interval.start).getTime();
          const endMs = new Date(interval.end).getTime();
          if (Number.isFinite(startMs) && Number.isFinite(endMs)) {
            busy.push({ startMs, endMs });
          }
        }
        calendarConnected = true;
        source = 'google';
      } catch (error) {
        console.error('[calendar/slots] free/busy failed; using local availability', error);
        warning =
          'Google Calendar could not be reached, so availability is based only on bookings made in this app.';
      }
    } else {
      warning =
        'The professor has not connected Google Calendar, so availability is based only on bookings made in this app.';
    }

    const { hour: startHour, minute: startMinute } = getWorkdayStart();
    const { hour: endHour, minute: endMinute } = getWorkdayEnd();
    const step = getSlotMinutes();
    const dayStartMinute = startHour * 60 + startMinute;
    const dayEndMinute = endHour * 60 + endMinute;
    const nowMs = Date.now();

    const slots: Slot[] = [];
    for (let minuteOfDay = dayStartMinute; minuteOfDay + step <= dayEndMinute; minuteOfDay += step) {
      const start = zonedDateTimeToUtc(
        date,
        Math.floor(minuteOfDay / 60),
        minuteOfDay % 60,
        timeZone,
      );
      const end = new Date(start.getTime() + step * 60_000);
      const overlaps = busy.some((interval) =>
        intervalsOverlap(start.getTime(), end.getTime(), interval.startMs, interval.endMs),
      );
      slots.push({
        start: start.toISOString(),
        end: end.toISOString(),
        available: !overlaps && start.getTime() > nowMs,
      });
    }

    return json({
      slots,
      date,
      timeZone,
      source,
      calendarConnected,
      ...(warning ? { warning } : {}),
    });
  });
}
