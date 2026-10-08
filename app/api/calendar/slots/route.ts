/**
 * GET /api/calendar/slots?subjectId=...&date=YYYY-MM-DD
 *
 * Returns 30-minute candidate slots for the requested day in the professor's
 * time zone, serialized as ISO UTC. Availability combines the professor's
 * existing local bookings. Appointment availability is managed in-app.
 */
import type { NextRequest } from 'next/server';
import type { NextResponse } from 'next/server';
import { ApiError, handleRoute, json } from '@/lib/api';
import { integrationQuery } from '@/lib/integrations-store';
import { googleBusy } from '@/lib/google-calendar';
import { hasProfessorRefreshToken } from '@/lib/tokens';
import {
  getCalendarTimeZone,
  getSlotMinutes,
  getWorkdayEnd,
  getWorkdayStart,
  isProfessorEmail,
  normalizeEmail,
} from '@/lib/env';
import { findStudentByEmail, findSubjectById } from '@/lib/roster';
import { getSession, requireSession, sessionEmail } from '@/lib/session';
import { dayBoundsUtc, intervalsOverlap, isValidIsoDate, zonedDateTimeToUtc } from '@/lib/time';

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

    const subjectId = (request.nextUrl.searchParams.get('subjectId')??'').trim();
    const date = (request.nextUrl.searchParams.get('date') ?? '').trim();

    if (!subjectId) {
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

    const localBookings = await integrationQuery('bookings',{professorEmail:subject.professor_email});
    const busy: BusyIntervalMs[] = localBookings.map((row:{start:string;end:string}) => ({startMs:new Date(row.start).getTime(),endMs:new Date(row.end).getTime()}));
    const calendarConnected = await hasProfessorRefreshToken(subject.professor_email);
    if(calendarConnected) {
      const external=await googleBusy(subject.professor_email,dayStart.toISOString(),dayEnd.toISOString());
      busy.push(...external.map(row=>({startMs:new Date(row.start).getTime(),endMs:new Date(row.end).getTime()})));
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
      source: calendarConnected?'google':'local',
      calendarConnected,
      warning: calendarConnected?undefined:'Google Calendar is not connected. These slots use appointments recorded in this app.',
    });
  });
}
