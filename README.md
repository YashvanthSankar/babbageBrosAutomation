# Babbage Bros — Student Success

Education automation built for CS Week: faculty import a student roster,
attendance, and test results; students see their attendance, marks, recovery
plan, and appointment availability.

## What it does

- Imports roster first, then subject attendance and marks from CSV or Excel.
- Provides validated previews and atomic, single-use confirmation.
- Calculates attendance risk and consecutive classes needed to recover;
  identifies weak scores and drops of at least 10 percentage points.
- Shows professor and student dashboards with server-scoped access.
- Dispatches personal warnings through Resend and newly-below-threshold
  calls through OmniDimension, recording notification status and preventing
  duplicates.
- Offers appointment booking with collision checks; a connected professor
  account can provide Google Calendar availability and events.

## Stack and hosting

Next.js, TypeScript, NextAuth, Convex, ExcelJS, Resend, Google Calendar,
and OmniDimension. Convex stores data and performs atomic mutations;
the VPS runs the web app and provider automation.

## Run locally

1. Run `npm ci`.
2. Configure `.env.local` using `.env.example`. Keep all credentials outside Git.
3. Deploy Convex functions to the selected deployment with `npx convex deploy`.
4. Run `npm run dev` and open `http://localhost:3000`.

Sign-in collects a name, Indian phone number, institute email ending in
`@iiitdm.ac.in`, and a non-empty demo password. Only the exact configured
`PROFESSOR_EMAIL` receives professor access. This competition login does not
verify passwords; use synthetic demo records.

## Judge flow

Sign in as professor, create a subject, import the roster, then attendance
and marks. Review the ranked risk results. Sign in with an imported student's
email to see only their records and book an available appointment.

CSV roster columns: `studentname,rollno,phone,email`.
Attendance: `rollno,YYYY-MM-DD,YYYY-MM-DD,...` with `P/A` cells; blank cells
are unrecorded. Dashboard CSV also accepts `present/absent` and `1/0`.
CSV marks: `rollno,subject,test_name,test_date,score,max_score`.
Excel templates are available from `/api/templates/roster`,
`/api/templates/attendance`, and `/api/templates/marks`.

## Verification and deployment

Run `npm test`, `npm run typecheck`, and `npm run build`.
See [deployment instructions](deploy/README.md) and
[shared architecture](docs/architecture.md) for configuration.

Provider delivery requires valid server credentials and a permitted test
recipient. Calendar synchronization requires professor OAuth consent.
Local appointment reservations remain available without that connection.
Weekly scheduled summaries are not yet implemented.
