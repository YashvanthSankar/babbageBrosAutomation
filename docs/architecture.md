# Education automation: shared implementation contract

## Persistence and ownership

## Provider connection contract

Credentials sign-in remains available. Optional professor-only Google OAuth uses provider `google-professor` and callback `/api/auth/callback/google-professor`; set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `GOOGLE_CALENDAR_ACCOUNT` to an explicitly approved demo Google account. That account must consent; its OAuth identity is mapped to the configured application professor, and its encrypted refresh token is stored under the professor identity. Connected slots merge that account's primary Calendar FreeBusy with local reservations; connected bookings create Calendar events. Unconnected slots explicitly use in-app availability. A Google API key alone cannot authorize private Calendar access.

Import confirmation triggers provider automation after durable commit; dashboard reads are side-effect free. Public mode simulates email and voice events by default. Import-triggered and weekly live tests require explicit `DEMO_LIVE_AUTOMATIONS=true`, provider configuration, and a server-pinned consenting test inbox/number. Live messages use fixed synthetic content and never disclose uploaded student contacts or academic details. Import-triggered email/voice use daily idempotency claims. Manual example email and call have separate atomic Convex claims for up to ten simulation and ten live attempts per professor per UTC day, independently per provider. A simulation cannot exhaust today's live allowance; a legacy pending/failed/dispatched claim still blocks the new live counter for that day. Each failed or uncertain provider attempt consumes an attempt. The dashboard has no manual simulation send button: it disables sending and explains missing readiness until live delivery is available. Direct API calls in default mode still record simulations. Live manual delivery to an entered contact requires an additional `DEMO_LIVE_MANUAL_RECIPIENTS=true`, an approved Google-verified professor session, and a consent attestation. Operator must obtain actual recipient consent separately; a checkbox cannot prove it. Without the additional opt-in, live manual delivery stays pinned at the API level. The Resend sandbox sender is rejected before a claim for entered inboxes other than the pinned test inbox; reaching arbitrary consenting inboxes requires a verified sending domain. Weekly digest and adviser escalation have per-professor, per-ISO-week claims and separate activity records; neither is a browser-read side effect.

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

After an attendance/marks import, the server records deduplicated warning-email activity. In default public mode this is explicitly marked simulated. Import-triggered live test email goes only to `DEMO_AUTOMATION_EMAIL`, never to an uploaded roster address. Attendance calls are considered only when an attendance import newly moves a student below threshold; public mode records a simulation and never calls the roster phone. Import-triggered live calls use only `DEMO_AUTOMATION_PHONE` with fixed synthetic context. The manual demo routes separately accept one entered address/Indian number for simulation. Extra-gated live manual sends may use the entered contact after verified professor OAuth and explicit consent attestation; they never consult uploaded student contacts. Failures do not undo a successful import; dashboard reads never trigger sends. `POST /api/automation/weekly` requires a professor session; `POST /api/automation/weekly/cron` requires Bearer `CRON_SECRET` and uses only the server-configured professor email. Convex computes total active students, distinct at-risk students and subject count, stores aggregate-only weekly/adviser activity and deduplicates by ISO week. Adviser escalation requires at least one at-risk student and `FACULTY_ADVISER_EMAIL`. Live adviser testing requires the adviser email to match the consenting pinned inbox; otherwise it is simulated. Live messages remain fixed synthetic text without student data or cohort counts.

## User interface

The faculty workspace and home page use a minimal white design, larger typography and restrained semantic colors. The faculty view provides overview, imports and automations, subject/department/risk filters, paginated students, expandable subject details and explicit recovery counts. The professor Calendar connection action and connected status are preserved. Private Calendar access requires professor Google OAuth consent. `npm run dev:preview` serves port 3001 with a separate `.next-preview` cache.

## Verification

npm run test, npm run typecheck, npm run build. Use synthetic data for the demo and validate deployed sign-in, roster/attendance/marks upload, risk, booking and notification status. Never commit .env.local or service credentials.
