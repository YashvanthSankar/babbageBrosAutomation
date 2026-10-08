# API reference

All JSON endpoints return `{ "data": ... }` on success or:

```json
{ "error": { "code": "VALIDATION_ERROR", "message": "...", "fields": {} } }
```

Except for health, templates, and demo session creation, endpoints require the `attendly_session` HTTP-only cookie. Browser clients receive it automatically. CLI clients must persist the cookie.

## Session and health

### `GET /api/health`

Checks both the HTTP service and database connection. Returns 200 with `status: "ok"`, or 503 with `DATABASE_UNAVAILABLE`.

### `POST /api/session/demo`

Upserts the demo teacher using `DEMO_TEACHER_EMAIL` and `DEMO_TEACHER_NAME`, sets the session cookie, and returns the teacher. No request body.

### `POST /api/session/logout`

Clears the session cookie.

PowerShell example:

```powershell
$session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
Invoke-RestMethod -Method Post -Uri http://localhost:3000/api/session/demo -WebSession $session
Invoke-RestMethod -Uri http://localhost:3000/api/students -WebSession $session
```

## Students

### `GET /api/students`

Returns all active and inactive students in roll-number order.

### `POST /api/students`

```json
{ "rollNumber": "CS001", "name": "Asha Rao", "email": "asha@example.com", "phone": "+91 98765 43210" }
```

Returns 201. Roll numbers are unique inside the teacher workspace.

### `PATCH /api/students`

Accepts `id` plus any of `rollNumber`, `name`, `email`, `phone`, or `active`.

## Subjects

### `GET /api/subjects`

Returns teacher-owned subjects ordered by name.

### `POST /api/subjects`

```json
{ "name": "Machine Learning", "code": "CS401", "attendanceThreshold": 85, "marksThreshold": 50 }
```

`code` is optional. Both thresholds must be integers from 1–99; attendance defaults to 85 and marks defaults to 50.

### `PATCH /api/subjects`

Accepts `id` plus any subject fields.

## Imports

### `POST /api/imports/roster/preview`

Send `multipart/form-data` with an `.xlsx` field named `file`.

### `POST /api/imports/attendance/preview`

Send `multipart/form-data` with fields `file` and `subjectId`.

Example preview response:

```json
{
  "data": {
    "batchId": "uuid",
    "expiresAt": "2026-10-08T14:00:00.000Z",
    "canConfirm": true,
    "report": { "errors": [], "warnings": [], "summary": { "students": 20 } },
    "preview": []
  }
}
```

### `POST /api/imports/{batchId}/confirm`

No request body. Returns batch type and processed row/record count. Confirmation is atomic and can happen only once.

### `POST /api/imports/marks/preview`

Send `multipart/form-data` with `file`, `subjectId`, `assessmentName`, `assessmentDate`, and `maxMarks`. The workbook contains `roll_number | marks_obtained`. Confirmation uses the same generic confirm endpoint.

### `GET /api/templates/roster`

Downloads the roster `.xlsx` template.

### `GET /api/templates/attendance`

Downloads the attendance `.xlsx` template.

### `GET /api/templates/marks`

Downloads the marks `.xlsx` template.

## Dashboard data

### `GET /api/dashboard?subjectId={uuid}`

The query parameter is optional; the first subject by name is selected by default. Returns the subject list, selected subject, summary counts, class average, and sorted per-student risk rows. Returns a null summary and empty student list when no subject exists.

### `GET /api/marks/dashboard?subjectId={convexId}`

Requires `subjectId`. Returns subject metadata, chronological assessments, summary counts, and students ordered Critical, Weak, Falling, Stable, and No Data. Each student includes latest, previous, average, percentage-point change, and boolean weak/falling flags.

## Important error codes

| Code | HTTP status | Meaning |
| --- | ---: | --- |
| `UNAUTHENTICATED` | 401 | Session missing or invalid |
| `VALIDATION_ERROR` | 422 | JSON/form field validation failed |
| `INVALID_WORKBOOK` | 422 | File type, size, or workbook structure failed |
| `DUPLICATE_ROLL` | 409 | Manual student creation reused a roll number |
| `SUBJECT_NOT_FOUND` | 404 | Subject is absent or belongs to another teacher |
| `BATCH_HAS_ERRORS` | 409 | Preview contains blocking errors |
| `BATCH_UNAVAILABLE` | 409 | Batch expired, was already claimed, or is not teacher-owned |
| `DATASTORE_UNAVAILABLE` | 503 | Health check could not reach Convex |
