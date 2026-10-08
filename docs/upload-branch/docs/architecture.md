# Architecture

## Stack

- Next.js App Router and TypeScript for Node-runtime HTTP handlers.
- PostgreSQL with Drizzle ORM and `postgres.js`.
- Zod for JSON and form-field validation.
- ExcelJS for `.xlsx` parsing and template generation.
- JOSE for signed HTTP-only demo-session cookies.
- Vitest for unit tests.

## Source layout

```text
app/api/                         HTTP route handlers
  dashboard/                    computed subject risk view
  health/                       API/database readiness
  imports/{roster,attendance}/  preview endpoints
  imports/[batchId]/confirm/    atomic import confirmation
  session/                      demo session and logout
  students/ and subjects/       scoped CRUD
  templates/                    generated .xlsx templates
lib/db/schema.ts                database source of truth
lib/imports/parser.ts           workbook contract and validation source of truth
lib/risk.ts                     risk formula and ordering source of truth
lib/validation.ts               JSON mutation schemas
tests/                          parser and risk unit tests
docs/                           product and engineering contracts
```

## Database model

- `teachers`: workspace owner and demo identity.
- `students`: owned by a teacher; `(teacher_id, roll_number)` is unique.
- `subjects`: owned by a teacher; `(teacher_id, name)` is unique.
- `import_batches`: normalized payload, checksum, validation report, lifecycle status, and expiry. It does not store the original binary.
- `attendance_records`: one status per `(student_id, subject_id, attendance_date)` with the latest source import.

Foreign keys cascade teacher, student, and subject deletion where appropriate. Deactivation is preferred for students because it preserves attendance history.

## Request and data flow

1. `POST /api/session/demo` upserts the configured demo teacher and returns a signed, HTTP-only cookie.
2. Every protected route verifies the cookie and derives `teacherId`; client-provided teacher IDs are never accepted.
3. A preview endpoint validates file type/size, parses the first worksheet, generates a normalized payload and report, and stores a pending batch that expires in 30 minutes.
4. Confirmation atomically claims the pending batch by changing it to `processing`. If the batch is invalid, expired, claimed, or confirmed, no domain write occurs.
5. Roster rows or attendance records are upserted in chunks inside the same transaction, after which the batch becomes `confirmed`.
6. Dashboard data is calculated from active students and the selected teacher-owned subject.

## Security model

The demo session is deliberately public and not production authentication. The cookie is signed, HTTP-only, `SameSite=Lax`, secure in production, and expires after 12 hours. All data access is scoped to the teacher ID from the verified cookie. Production deployments must set a long random `SESSION_SECRET`.

The backend validates upload extension and byte size before parsing. Validation reports are capped to prevent oversized error responses, and workbook row/date limits constrain parsing work.
