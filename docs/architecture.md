# Education automation: shared implementation contract

## Persistence and ownership

## Provider connection contract

Credentials sign-in remains available. Optional professor-only Google OAuth uses provider `google-professor` and callback `/api/auth/callback/google-professor`; set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` and stable token encryption secret. The exact configured professor must consent. Connected slots merge Google FreeBusy and local reservations; unconnected slots explicitly use in-app availability. Connected bookings create Google events.

Import confirmation on the VPS sends grounded risk emails when `RESEND_API_KEY` and `RESEND_FROM_EMAIL` are configured, alerting student, professor and optional `FACULTY_ADVISER_EMAIL`. Roster phone numbers are synthetic showcase data and never trigger OmniDimension. Only the professor-entered example number at `/api/voice/demo-call` can dispatch a call, with fixed 69% attendance context and rate limits. No provider dispatch occurs during dashboard reads.

Per the user's explicit 2026-10-08 production instruction, Convex is canonical persistence. Production project is Denoise Labs / bb-automation (project 3173172), deployment groovy-sheep-854. Next.js and automation run on the VPS; provider HTTP calls are performed server-side there.

Schema source: convex/schema.ts. Core atomic imports/CRUD: convex/backend.ts. Dashboard data: convex/dashboard.ts. Booking, token and notification persistence: convex/integrations.ts. Server adapters use lib/convex.ts with a server-only CONVEX_BACKEND_SECRET. db/schema.sql and archived Drizzle/JOSE implementations are historical references.

All public Convex functions validate the shared secret; owner IDs are resolved from the NextAuth session on the Next server. Professor is the exact configured PROFESSOR_EMAIL. Student records are selected by session email. Never accept a teacher owner from client input. Student dashboards omit other students and raw phone contacts.

## Tables and IDs

Convex string document IDs are preserved end-to-end; do not coerce IDs to numbers. Core tables: teachers, students, subjects, importBatches, attendanceRecords, assessments, marksRecords. Teachers are indexed by normalized email; students by teacher and normalized roll. Subjects carry attendanceThreshold and marksThreshold. Imports do not persist original files. Additional booking/token/notification tables are declared in the shared schema.

Roster confirmation resolves both roll and normalized email under the same teacher, so a student who signs in before upload is attached to the imported roll without creating a duplicate identity. Conflicting identities reject the transaction. Imports never transfer ownership between teachers.

## Import contracts

Roster first. XLSX: roll_number,name,email,phone. Dashboard CSV aliases include studentname,rollno,phone,email. Attendance: roll_number followed by actual class-date columns; XLSX statuses P/A, CSV also present/absent and 1/0. Blank cells are skipped. Unknown students are validation errors.

Marks XLSX: roll_number,marks_obtained with multipart subjectId,assessmentName,assessmentDate,maxMarks. CSV: rollno,subject,test_name,test_date,score,max_score; selecting subjectId replaces per-row subject matching. All scores must be finite and between zero and the positive maximum. Re-imports update scores; changing an assessment maximum re-normalizes its scores atomically and rejects an impossible maximum.

POST /api/imports/{roster,attendance,marks}/preview stages a batch and returns {data:{batchId,expiresAt,canConfirm,report,preview}}. POST /api/imports/{batchId}/confirm validates ownership, expiry and errors then applies all data in one Convex transaction. A failed validation rolls back all changes. Dashboard POST /api/ingest/{roster,attendance,marks} uses the same service. Templates are GET /api/templates/{roster,attendance,marks}. GET /api/students and /api/subjects return dashboard-friendly IDs.

## Risk and downstream automation

Attendance percentage is attended/total*100; no classes means no data. For target t, required consecutive classes are max(0,ceil((t*total-attended)/(1-t))). Marks flags use comparable percentages. Dashboard sorts high-risk students first.

Email automation occurs after durable import commit, never during GET. Student call actions return a synthetic-data notice without contacting the provider. The explicit professor demo-call route is the sole voice dispatch path. Email failures are recorded without undoing a successful import. Integration code documents calendar availability and booking behavior honestly.

## Verification

npm run test, npm run typecheck, npm run build. Use synthetic data for the demo and validate deployed sign-in, roster/attendance/marks upload, risk, booking and notification status. Never commit .env.local or service credentials.
