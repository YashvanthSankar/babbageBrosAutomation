# Education automation: shared implementation contract

## Actors and safety

- One professor/admin initially, configured by `PROFESSOR_EMAIL` (exact address). Never infer admin from the email domain. The demo sign-in requires a name, Indian E.164 phone, `@iiitdm.ac.in` email, and any non-empty password; all non-admin institute emails are students.
- Never trust a student ID or email from a client request for authorization: look up the authenticated session email and map it to the roster. No student may see another student's marks/attendance or raw phone number. Admin-only uploads, roster, risk table and notifications.

## Canonical data

- `students`: `id`, `name`, `roll_no` (unique), `email` (unique, normalized lowercase), `phone` (admin-only), `active` (default true); professor membership via `professor_email`.
- `subjects`: `id`, `name`, `code`, `professor_email`, `department`, `threshold` (1–99, default 85).
- `attendance_records`: `student_id`, `subject_id`, `class_date` (ISO date), `present` (boolean). Unique by `(student_id, subject_id, class_date)`; update rather than double-count on re-import.
- `test_results`: `student_id`, `subject_id`, `test_name`, `test_date`, `score`, `max_score`. Calculate percentages for comparable results.
- `import_batches`: staged, single-use `.xlsx`/`.csv` previews from the ported ingestion API. Stores `professor_email`, optional `subject_id`, `type` (`roster|attendance|marks`), `filename`, `checksum`, `status` (`pending|processing|confirmed|expired`), `parsed_payload` (JSONB), `validation_report` (JSONB), `expires_at` (30 minutes) and `confirmed_at`. The original binary is never stored.
- `bookings`: `id`, `student_id`, `subject_id`, `professor_email`, `starts_at`, `ends_at`, `status`. Prevent overlapping reservations locally with a transactional lock.
- `notification_events`: idempotency key per student/subject/risk transition, provider, status, timestamp (voice teammate).

**Upload order:** professor imports roster FIRST, then attendance or marks. Reject unknown roll numbers and return a row-specific error. Roster mandatory columns `studentname,rollno,phone,email`. Attendance accepts `rollno,date1,date2,...` where each date header is an actual parseable class date (`YYYY-MM-DD` preferred), and values such as `P/A`, `present/absent`, `1/0`; skip blank cells. Subject is required separately for each upload. Marks need `rollno,subject,test_name,test_date,score,max_score` (or a subject selected in UI). Ingestion teammate should publish exact accepted formats and errors in this document.

Risk is computed, not AI-generated: `attendancePercent = attended / total * 100`; `classesToRecover = max(0, ceil((0.85 * total - attended) / 0.15))` with 0 total classes treated as no attendance data, not 0%. Flag below 85, optionally warn at 85–90; show latest marks and a falling trend compared with the previous comparable result.

## HTTP interfaces (JSON)

- `GET /api/dashboard`: session-scoped result. Admin gets `{role:"admin",professor,stats,students:[{id,name,rollNo,email,department,subjects:[{id,code,name,attended,total,attendancePercent,classesToRecover,latestScore,previousScore,atRisk}],riskLevel}]}`. Student gets `{role:"student",student:<same student object>,professor}`. No phone in student response.
- `GET /api/calendar/slots?subjectId=...&date=YYYY-MM-DD`: student and professor allowed; return `{slots:[{start,end,available}]}` in ISO UTC from local appointment reservations.
- `POST /api/calendar/book`: `{subjectId,start,end}`; derive student from session; server validates subject membership, dates, availability, and creates booking/event. Returns `{booking:{id,start,end,status}}` or a clear actionable error.
- `POST /api/ingest/roster`, `/api/ingest/attendance`, `/api/ingest/marks`: admin only; multipart `file` (`.csv` or `.xlsx`) plus `subjectId` for attendance and optional marks; report `{imported,updated,errors:[{row,message}]}`. Implemented in `app/api/ingest/*`.
- `POST /api/imports/roster/preview`, `/api/imports/attendance/preview`, `/api/imports/{batchId}/confirm`: the ported preview/confirm ingestion API (admin only, `.xlsx` or `.csv`). Preview stages an `import_batches` row and returns `{data:{batchId,expiresAt,canConfirm,report,preview}}`; confirm atomically applies it once. Canonical docs are archived at `docs/upload-branch/docs/import-contracts.md`.
- `/api/voice/*`: voice teammate owns trigger/deduplication and logging; below-threshold transitions only, never on dashboard GET.

## Appointment slots

Appointment availability is local to this application. A transactional reservation prevents double-booking; it is not Google Calendar synchronization.

## Integration / deployment

Next.js TypeScript App Router with PostgreSQL on VPS. Keep imports and provider calls on server routes; frontend fetches session-scoped endpoints. Set `DATABASE_URL`, `NEXTAUTH_URL`, `NEXTAUTH_SECRET`, `PROFESSOR_EMAIL`, and provider-specific secrets only if integration enabled. Start the DB schema before imports; do not delete or replace teammates' uncommitted files. Demo video must show actual hosted flow and identify any unavailable provider capability honestly.
