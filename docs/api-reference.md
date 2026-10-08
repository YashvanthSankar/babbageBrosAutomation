# API reference

The Next.js server is the public API. It verifies the NextAuth session, derives the professor/student identity from that session, and accesses Convex using a server-only secret. Do not call Convex with the backend secret from a browser.

Most route errors use `{ "error": { "code": "...", "message": "...", "details": ... } }`. Successful response shapes vary by endpoint. The dashboard uses the NextAuth browser session cookie automatically.

## Authentication and safety

- Sign-in uses the app's NextAuth flow. The demo accepts any non-empty password; the exact `PROFESSOR_EMAIL` is treated as the professor/admin and institute-domain emails enter the student flow.
- This is demo access, not identity verification. Never use real student marks, phone numbers, or other private records on the public demo.
- Professor-only routes require the admin session. Student routes derive the student from the signed-in email; clients must not supply an owner identity to gain access.
- Google Calendar uses a separate professor-only OAuth consent flow. A Google API key alone cannot read or create events in a private calendar.

## Health and dashboard

### `GET /api/health`

Checks the server-to-Convex connection. Returns the Convex health result or a standard API error.

### `GET /api/dashboard`

Returns the signed-in user's dashboard. Admin receives the professor workspace and risk-ranked student/subject statistics; a student receives only their own records. Attendance recovery and marks flags are calculated server-side.

### `GET /api/marks/dashboard`

Returns marks information scoped to the signed-in user/administrator.

## Subjects and students

### `GET`, `POST`, `PATCH /api/subjects`

Professor-only subject management. Create a subject with JSON such as:

```json
{ "name": "Algorithms", "code": "CS301", "department": "CSE", "threshold": 85, "marksThreshold": 50 }
```

`threshold` is the attendance percentage target; marks threshold is a percentage.

### `GET`, `POST`, `PATCH /api/students`

Professor-only student roster management. The roster should be imported before attendance or marks. Student phone numbers are admin-only and are not returned in student dashboard responses.

## Imports

Uploads are `multipart/form-data` with a `file` field. Roster is imported first. Attendance and marks uploads also need the relevant `subjectId`.

### Staged preview and confirmation

- `POST /api/imports/roster/preview` — stage and validate a roster file.
- `POST /api/imports/attendance/preview` — requires `file` and `subjectId`.
- `POST /api/imports/marks/preview` — requires `file`, `subjectId`, `assessmentName`, `assessmentDate` (`YYYY-MM-DD`), and `maxMarks`.
- `POST /api/imports/{batchId}/confirm` — apply a valid staged batch once. Preview batches expire; validation or ownership errors prevent confirmation.

Preview responses include `{ data: { batchId, expiresAt, canConfirm, report, preview } }`. CSV and XLSX are accepted by the preview routes. Attendance CSV date columns should be real dates; blank cells are skipped. Unknown roster IDs, invalid dates/statuses, and invalid scores are reported rather than silently assigned.

### Direct dashboard imports

`POST /api/ingest/roster`, `/api/ingest/attendance`, and `/api/ingest/marks` are professor-only multipart endpoints for the dashboard's direct import flow. Attendance requires `subjectId`; marks requires assessment metadata and `subjectId`. These routes apply validated records directly instead of returning a separate preview batch.

### Templates

- `GET /api/templates/roster`
- `GET /api/templates/attendance`
- `GET /api/templates/marks`

Downloads the corresponding import template.

## Appointments and Google Calendar

### `GET /api/calendar/connection`

Professor-only setup status: reports the app professor email, the configured dedicated Google account email, whether OAuth is configured, and whether the professor has connected it. It never returns credentials or tokens.

### `GET /api/calendar/slots?subjectId=...&date=YYYY-MM-DD`

Returns candidate slots as ISO timestamps and indicates whether availability came from Google Calendar or in-app reservations. If the professor has not connected Google Calendar, the response explains that availability is local only.

### `POST /api/calendar/book`

Student-only. JSON body:

```json
{ "subjectId": "...", "start": "2026-10-09T04:30:00.000Z", "end": "2026-10-09T05:00:00.000Z" }
```

The server derives the student from the session, checks professor/subject ownership and slot conflicts, and records the booking. When professor OAuth is connected, it also checks Google availability and creates a Calendar event. Without OAuth, it is an in-app booking only.

## Automation status and activity

### `GET /api/automation/status`

Professor-only provider readiness: Convex, simulation/live mode, Resend, OmniDimension, Calendar, and weekly-summary configuration. A provider-accepted status is not proof an email was read or a call was answered.

### `GET /api/automation/activity`

Professor-only recent notification and aggregate events, including whether an action was simulated, accepted by a provider, or failed. Aggregate events show counts, not student identities.

### `POST /api/voice/call`

Professor-only JSON `{ "studentId": "...", "subjectId": "..." }`. The service checks risk; public mode records a simulation. Explicit live tests can dispatch only to a server-pinned consenting test number using fixed synthetic context. This route does not accept a phone number. There is no arbitrary-number demo-call endpoint.

### `POST /api/email/demo-send`

Professor-only JSON `{}`. Simulates a fixed synthetic 69% warning by default; live testing requires `DEMO_LIVE_AUTOMATIONS=true`, Resend configuration and a consenting `DEMO_AUTOMATION_EMAIL` on the server. An optional `email` field must match that server-pinned address; arbitrary recipients are rejected. A durable Convex claim limits the action to one attempt per professor per UTC day, even across VPS restarts. Provider acceptance does not confirm inbox delivery.

### `POST /api/automation/weekly`

Professor-only JSON `{}`. Returns `{week, counts: {totalStudents, atRiskStudents, subjects}, results}`. Computes counts inside Convex, records at most one weekly digest and (if an adviser is configured and anyone is at risk) one adviser escalation per ISO week. Simulates by default. Optional live messages contain fixed synthetic text only and go solely to the server-pinned consenting inbox; adviser live testing additionally requires `FACULTY_ADVISER_EMAIL` to match that inbox. A failed attempt is recorded and not automatically retried in the same week.

### `POST /api/automation/weekly/cron`

Same workflow, but authenticates with `Authorization: Bearer <CRON_SECRET>` instead of a professor session and uses only the server-configured `PROFESSOR_EMAIL`. A missing secret returns 503 and an invalid secret returns 401. Run from a private VPS cron job; this route does not create a schedule itself.

## Common error codes

| Code | Meaning |
| --- | --- |
| `UNAUTHENTICATED` | No valid signed-in session |
| `FORBIDDEN` | Session role or ownership does not permit the action |
| `VALIDATION_ERROR` | Invalid request or upload fields |
| `INVALID_WORKBOOK` | Unsupported or malformed import file |
| `BATCH_HAS_ERRORS` | Staged import contains blocking validation errors |
| `BATCH_UNAVAILABLE` | Batch expired, already applied, or not owned by the professor |
| `SLOT_UNAVAILABLE` | The requested appointment overlaps an existing booking/event |
| `INTERNAL_ERROR` | Unexpected server error; check server logs without logging secrets |
