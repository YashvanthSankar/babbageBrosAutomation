# Education automation: shared implementation contract

## Actors and safety

- One professor/admin initially, configured by `PROFESSOR_EMAIL` (exact address). Never infer admin from the email domain. All other users must have a Google-verified `@iiitdm.ac.in` email **and** be present in the student roster to see their own records.
- Never trust a student ID or email from a client request for authorization: look up the authenticated session email and map it to the roster. No student may see another student's marks/attendance or raw phone number. Admin-only uploads, roster, risk table and notifications.
- If OAuth/Calendar is not configured, show an honest setup or unavailable state, not a fake connected calendar. Never commit real attendance/phone datasets or Google refresh tokens.

## Canonical data

- `students`: `id`, `name`, `roll_no` (unique), `email` (unique, normalized lowercase), `phone` (admin-only); professor membership via `professor_email`.
- `subjects`: `id`, `name`, `code`, `professor_email`, `department`.
- `attendance_records`: `student_id`, `subject_id`, `class_date` (ISO date), `present` (boolean). Unique by `(student_id, subject_id, class_date)`; update rather than double-count on re-import.
- `test_results`: `student_id`, `subject_id`, `test_name`, `test_date`, `score`, `max_score`. Calculate percentages for comparable results.
- `bookings`: `id`, `student_id`, `subject_id`, `professor_email`, `starts_at`, `ends_at`, `google_event_id`, `status`. Prevent overlapping reservations, and verify Google availability server-side before event creation.
- `notification_events`: idempotency key per student/subject/risk transition, provider, status, timestamp (voice teammate).

**Upload order:** professor imports roster FIRST, then attendance or marks. Reject unknown roll numbers and return a row-specific error. Roster mandatory columns `studentname,rollno,phone,email`. Attendance accepts `rollno,date1,date2,...` where each date header is an actual parseable class date (`YYYY-MM-DD` preferred), and values such as `P/A`, `present/absent`, `1/0`; skip blank cells. Subject is required separately for each upload. Marks need `rollno,subject,test_name,test_date,score,max_score` (or a subject selected in UI). Ingestion teammate should publish exact accepted formats and errors in this document.

Risk is computed, not AI-generated: `attendancePercent = attended / total * 100`; `classesToRecover = max(0, ceil((0.85 * total - attended) / 0.15))` with 0 total classes treated as no attendance data, not 0%. Flag below 85, optionally warn at 85–90; show latest marks and a falling trend compared with the previous comparable result.

## HTTP interfaces (JSON)

- `GET /api/dashboard`: session-scoped result. Admin gets `{role:"admin",professor,stats,students:[{id,name,rollNo,email,department,subjects:[{id,code,name,attended,total,attendancePercent,classesToRecover,latestScore,previousScore,atRisk}],riskLevel}]}`. Student gets `{role:"student",student:<same student object>,professor}`. No phone in student response.
- `GET /api/calendar/slots?subjectId=...&date=YYYY-MM-DD`: student and professor allowed; return `{slots:[{start,end,available}]}` in ISO UTC; check professor free/busy, with a documented fallback if no Google consent.
- `POST /api/calendar/book`: `{subjectId,start,end}`; derive student from session; server validates subject membership, dates, availability, and creates booking/event. Returns `{booking:{id,start,end,status}}` or a clear actionable error.
- `POST /api/ingest/roster`, `/api/ingest/attendance`, `/api/ingest/marks`: admin only; ingestion teammate owns implementation and reports `{imported,updated,errors:[{row,message}]}`. Coordinate actual request encoding (multipart CSV + subject ID) before UI wiring.
- `/api/voice/*`: voice teammate owns trigger/deduplication and logging; below-threshold transitions only, never on dashboard GET.

## Google Calendar integration

Professor signs in via Google OAuth and consents to Calendar scope; store refresh token server-side with encryption if persisted, or in the secure NextAuth JWT for a single-professor MVP. Student sign-in requires only profile/email scope. To book: query FreeBusy on professor's primary calendar, create a 20–30-minute event with student attendee, and persist the returned event ID. Google OAuth app in Testing mode must explicitly add all demo users. `@iiitdm.ac.in` domain string alone does not authenticate a person; require verified Google sign-in and roster membership.

## Integration / deployment

Next.js TypeScript App Router with PostgreSQL on VPS. Keep import and provider calls on server routes; frontend fetches session-scoped endpoints. Set `DATABASE_URL`, `NEXTAUTH_URL`, `NEXTAUTH_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `PROFESSOR_EMAIL`; provider-specific secrets only if integration enabled. Start the DB schema before imports; do not delete or replace teammates' uncommitted files. HTTPS required for production OAuth callbacks. Demo video must show actual hosted flow and identify any unavailable provider capability honestly.
