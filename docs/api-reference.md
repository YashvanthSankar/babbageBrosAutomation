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

Uploads are `multipart/form-data` with a `file` field. Roster is imported first. Attendance needs the relevant `subjectId`; Excel marks need `subjectId` and assessment metadata, while CSV marks may identify subjects per row or use a selected `subjectId`.

### Staged preview and confirmation

- `POST /api/imports/roster/preview` — stage and validate a roster file.
- `POST /api/imports/attendance/preview` — requires `file` and `subjectId`.
- `POST /api/imports/marks/preview` — requires `file`, `subjectId`, `assessmentName`, `assessmentDate` (`YYYY-MM-DD`), and `maxMarks`.
- `POST /api/imports/{batchId}/confirm` — apply a valid staged batch once. Preview batches expire; validation or ownership errors prevent confirmation.

Preview responses include `{ data: { batchId, expiresAt, canConfirm, report, preview } }`. CSV and XLSX are accepted by the preview routes. Attendance CSV date columns should be real dates; blank cells are skipped. Unknown roster IDs, invalid dates/statuses, and invalid scores are reported rather than silently assigned.

### Direct dashboard imports

`POST /api/ingest/roster`, `/api/ingest/attendance`, and `/api/ingest/marks` are professor-only multipart endpoints for the dashboard's direct import flow. Attendance requires `subjectId`; Excel marks require `subjectId`, `assessmentName`, `assessmentDate`, and `maxMarks`. CSV marks take test data in their rows and can use `subjectId` to select a subject. These routes stage and confirm validated records immediately instead of returning a separate preview batch.

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

Professor-only provider readiness: Convex, simulation/live mode, Resend, OmniDimension, Calendar, weekly-summary configuration, and `manualEnteredContacts.{serverEnabled,professorVerified}`. Existing email/voice `liveAllowed` fields describe the pinned import/weekly destinations; manual entered-contact delivery has its own gate. A provider-accepted status is not proof an email was read or a call was answered.

### `GET /api/automation/activity`

Professor-only recent notification and aggregate events, including whether an action was simulated, accepted by a provider, or failed. Aggregate events show counts, not student identities.

### `POST /api/voice/call`

Professor-only JSON `{ "studentId": "...", "subjectId": "..." }`. The service checks risk; public mode records a simulation. Explicit live tests can dispatch only to a server-pinned consenting test number using fixed synthetic context. This route does not accept a phone number.

### `POST /api/voice/demo-call`

Professor-only JSON `{}` or `{ "phone": "+91...", "consentConfirmed": true }`. Direct API calls in default mode record a **simulation** (no call); the dashboard only enables its real-send action when live readiness is confirmed. Normal live mode allows only the consenting server-pinned `DEMO_AUTOMATION_PHONE`. To dispatch to the entered number, the server additionally requires `DEMO_LIVE_MANUAL_RECIPIENTS=true`, a Google-verified professor session, and explicit consent confirmation. Fixed synthetic 69% content; separate durable daily claims permit up to ten simulations and ten live attempts per professor per UTC day (each live failure consumes an attempt). Legacy pending/failed/dispatched same-day claims still block new live attempts; a legacy simulation does not. No number is persisted in aggregate activity. OmniDimension configuration is required for live mode. Provider acceptance does not prove the call connected. The manual cap is separate from import-triggered call deduplication; on 9 October this endpoint still returned 404 on the VPS.

### `POST /api/email/demo-send`

Professor-only JSON `{}` or `{ "email": "person@example.com", "consentConfirmed": true }`. Direct API calls in default mode record a **simulation** (no email); the dashboard only enables its real-send action when live readiness is confirmed. Normal live mode remains limited to the consenting pinned `DEMO_AUTOMATION_EMAIL`. Delivery to an entered address additionally requires `DEMO_LIVE_MANUAL_RECIPIENTS=true`, a Google-verified professor session and explicit consent confirmation; the operator must independently obtain the recipient's consent. Live sending needs Resend configuration and a verified sender for that destination. With the Resend sandbox sender, an entered address different from the pinned inbox is refused **before** a claim; the sandbox can reach only the account owner's inbox. Separate durable Convex claims allow up to ten simulated and ten live attempts per professor per UTC day; legacy live claims still block new live attempts, and uncertain failures consume one attempt. Only fixed synthetic 69% content is sent; entered addresses are not persisted in aggregate activity. Provider acceptance does not confirm inbox delivery.

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
