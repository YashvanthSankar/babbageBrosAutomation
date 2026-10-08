/**
 * POST /api/calendar/book  { subjectId, start, end }
 *
 * Flow (all server-side):
 *   1. derive the student from the session email mapped to the roster
 *   2. validate subject ownership and booking window
 *   3. reserve the local appointment slot in a Convex mutation with an
 *      overlap check
 *
 * The mutation serializes conflicting reservations on the professor's
 * booking set. Google availability is checked before this local reservation;
 * a remote event created concurrently may still race that check.
 */
import type { NextRequest } from 'next/server';
import type { NextResponse } from 'next/server';
import { ApiError, handleRoute, json } from '@/lib/api';
import { integrationMutation } from '@/lib/integrations-store';
import { googleBusy, createGoogleBooking } from '@/lib/google-calendar';
import { hasProfessorRefreshToken } from '@/lib/tokens';
import { getMaxBookingMinutes, getMinBookingMinutes } from '@/lib/env';
import { findStudentByEmail, findSubjectById } from '@/lib/roster';
import { getSession, requireSession, sessionEmail } from '@/lib/session';
import { minutesBetween, parseInstant } from '@/lib/time';

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

    const subjectId = String(payload.subjectId??'');
    if (!subjectId) {
      throw new ApiError(400, 'INVALID_SUBJECT', 'Choose a valid subject.');
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

    const startIso = start.toISOString();
    const endIso = end.toISOString();

    // Re-check local overlap in the Convex reservation mutation.
    const calendarConnected=await hasProfessorRefreshToken(subject.professor_email);
    if(calendarConnected && (await googleBusy(subject.professor_email,startIso,endIso)).length) throw new ApiError(409,'SLOT_UNAVAILABLE','This time is occupied in the professor calendar.');
    let bookingId:string;
    try{bookingId=await integrationMutation('reserve',{studentId:student.id,subjectId:subject.id,professorEmail:subject.professor_email,start:startIso,end:endIso});}
    catch(error){
      const data=error && typeof error==='object' && 'data' in error ? String(error.data) : '';
      if(data==='SLOT_UNAVAILABLE'||error instanceof Error&&error.message.includes('SLOT_UNAVAILABLE'))throw new ApiError(409,'SLOT_UNAVAILABLE','That slot was just booked. Choose another time.');
      throw error;
    }
    try {
      const googleEventId=calendarConnected?await createGoogleBooking(subject.professor_email,{start:startIso,end:endIso,studentEmail:email,studentName:student.name,subjectName:subject.name,bookingId}):undefined;
      await integrationMutation('finishBooking',{id:bookingId,status:'confirmed',...(googleEventId?{googleEventId}:{})});
    }catch(error){await integrationMutation('finishBooking',{id:bookingId,status:'failed'});throw error;}

    return json(
      {
        booking: {
          id: bookingId,
          start: startIso,
          end: endIso,
          status: 'confirmed',
        },
      },
      201,
    );
  });
}
