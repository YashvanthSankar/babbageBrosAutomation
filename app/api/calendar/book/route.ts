/**
 * POST /api/calendar/book  { subjectId, start, end }
 *
 * Flow (all server-side):
 *   1. derive the student from the session email mapped to the roster
 *   2. validate subject ownership and booking window
 *   3. verify Google free/busy for the requested window
 *   4. reserve the slot transactionally (advisory lock + overlap check)
 *   5. create the professor's calendar event and confirm the booking
 *
 * A slot is only reserved after the free/busy check; the DB transaction makes
 * double booking impossible even under concurrent requests. If the Google event
 * fails the reservation is marked `failed` so it never blocks future bookings.
 */
import type { NextRequest } from 'next/server';
import type { NextResponse } from 'next/server';
import { ApiError, handleRoute, json } from '@/lib/api';
import { query, withTransaction } from '@/lib/db';
import {
  getCalendarTimeZone,
  getMaxBookingMinutes,
  getMinBookingMinutes,
} from '@/lib/env';
import { createCalendarEvent, isCalendarConfigured, queryFreeBusy } from '@/lib/google-calendar';
import { findStudentByEmail, findSubjectById } from '@/lib/roster';
import { getSession, requireSession, sessionEmail } from '@/lib/session';
import { intervalsOverlap, minutesBetween, parseInstant } from '@/lib/time';
import { hasProfessorRefreshToken } from '@/lib/tokens';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface BookingRow {
  id: number;
  starts_at: Date;
  ends_at: Date;
  status: string;
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  return handleRoute(async () => {
    const session = requireSession(await getSession());
    if (session.user.role !== 'student') {
      throw new ApiError(403, 'FORBIDDEN', 'Only students can book a consultation.');
    }
    const email = sessionEmail(session);

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      throw new ApiError(400, 'INVALID_BODY', 'Request body must be valid JSON.');
    }
    const payload = (body ?? {}) as { subjectId?: unknown; start?: unknown; end?: unknown };

    const subjectId = Number(payload.subjectId);
    if (!Number.isInteger(subjectId) || subjectId <= 0) {
      throw new ApiError(400, 'INVALID_SUBJECT', 'subjectId must be a positive integer.');
    }

    const start = parseInstant(payload.start);
    const end = parseInstant(payload.end);
    if (!start || !end) {
      throw new ApiError(400, 'INVALID_TIME', 'start and end must be valid ISO date-time strings.');
    }
    if (end.getTime() <= start.getTime()) {
      throw new ApiError(400, 'INVALID_RANGE', 'end must be after start.');
    }

    const duration = minutesBetween(start.getTime(), end.getTime());
    const minMinutes = getMinBookingMinutes();
    const maxMinutes = getMaxBookingMinutes();
    if (duration < minMinutes || duration > maxMinutes) {
      throw new ApiError(
        400,
        'INVALID_DURATION',
        `Bookings must be between ${minMinutes} and ${maxMinutes} minutes.`,
      );
    }
    if (start.getTime() <= Date.now()) {
      throw new ApiError(400, 'INVALID_TIME', 'The booking start time must be in the future.');
    }

    const subject = await findSubjectById(subjectId);
    if (!subject) {
      throw new ApiError(404, 'SUBJECT_NOT_FOUND', 'That subject does not exist.');
    }

    const student = await findStudentByEmail(email);
    if (!student) {
      throw new ApiError(
        403,
        'NOT_IN_ROSTER',
        'Your account is not on the professor roster, so you cannot book a consultation.',
      );
    }
    if (student.professor_email !== subject.professor_email) {
      throw new ApiError(403, 'FORBIDDEN', 'That subject belongs to a different professor.');
    }

    if (!isCalendarConfigured() || !(await hasProfessorRefreshToken(subject.professor_email))) {
      throw new ApiError(
        503,
        'CALENDAR_UNAVAILABLE',
        'The professor has not connected Google Calendar, so bookings cannot be created right now.',
      );
    }

    const startIso = start.toISOString();
    const endIso = end.toISOString();

    // Server-side availability revalidation against the live calendar.
    const googleBusy = await queryFreeBusy(subject.professor_email, startIso, endIso);
    const calendarConflict = googleBusy.some((interval) =>
      intervalsOverlap(
        start.getTime(),
        end.getTime(),
        new Date(interval.start).getTime(),
        new Date(interval.end).getTime(),
      ),
    );
    if (calendarConflict) {
      throw new ApiError(
        409,
        'SLOT_UNAVAILABLE',
        'That time is no longer free on the professor calendar. Please choose another slot.',
      );
    }

    // Transactional reservation: serialize bookings per professor and re-check
    // local overlap inside the lock.
    const booking = await withTransaction(async (client) => {
      await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [
        subject.professor_email,
      ]);
      const clash = await client.query<{ id: number }>(
        `SELECT id
           FROM bookings
          WHERE professor_email = $1
            AND status IN ('pending', 'confirmed')
            AND starts_at < $3
            AND ends_at > $2
          LIMIT 1`,
        [subject.professor_email, startIso, endIso],
      );
      if (clash.rowCount && clash.rowCount > 0) {
        throw new ApiError(
          409,
          'SLOT_UNAVAILABLE',
          'That slot was just booked. Please choose another time.',
        );
      }
      const inserted = await client.query<BookingRow>(
        `INSERT INTO bookings (student_id, subject_id, professor_email, starts_at, ends_at, status)
              VALUES ($1, $2, $3, $4, $5, 'pending')
           RETURNING id, starts_at, ends_at, status`,
        [student.id, subject.id, subject.professor_email, startIso, endIso],
      );
      return inserted.rows[0];
    });

    // Create the calendar event; mark the reservation failed if Google rejects it.
    let eventId: string;
    try {
      const event = await createCalendarEvent(subject.professor_email, {
        summary: `${subject.code} consultation - ${student.name}`,
        description: `Consultation booked through the education automation portal.\nStudent: ${student.name} (${student.roll_no})\nSubject: ${subject.code} - ${subject.name}`,
        startIso,
        endIso,
        timeZone: getCalendarTimeZone(),
        attendeeEmail: student.email,
      });
      eventId = event.id;
    } catch (error) {
      await query(`UPDATE bookings SET status = 'failed', updated_at = now() WHERE id = $1`, [
        booking.id,
      ]);
      throw error;
    }

    await query(
      `UPDATE bookings SET status = 'confirmed', google_event_id = $2, updated_at = now() WHERE id = $1`,
      [booking.id, eventId],
    );

    return json(
      {
        booking: {
          id: booking.id,
          start: new Date(booking.starts_at).toISOString(),
          end: new Date(booking.ends_at).toISOString(),
          status: 'confirmed',
          eventId,
        },
      },
      201,
    );
  });
}
