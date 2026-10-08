# Architecture

## Stack

- Next.js App Router and TypeScript for Node-runtime HTTP handlers.
- Convex for durable data, indexes, queries, and atomic mutations.
- Zod for JSON and form-field validation.
- ExcelJS for `.xlsx` parsing and template generation.
- JOSE for signed HTTP-only demo-session cookies.
- Vitest for unit tests.

## Source layout

```text
app/api/                         HTTP adapters and workbook upload handlers
  dashboard/                    computed subject risk view
  health/                       API/database readiness
  imports/{roster,attendance}/  preview endpoints
  imports/[batchId]/confirm/    atomic import confirmation
  session/                      demo session and logout
  students/ and subjects/       scoped CRUD
  templates/                    generated .xlsx templates
convex/schema.ts                intended Convex schema source of truth
convex/                         intended queries and mutations
lib/imports/parser.ts           workbook contract and validation source of truth
lib/risk.ts                     risk formula and ordering source of truth
lib/validation.ts               JSON mutation schemas
tests/                          parser and risk unit tests
docs/                           product and engineering contracts
```

## Convex data model

- `teachers`: workspace owner and demo identity; indexed by email.
- `students`: owned by a teacher; indexed by teacher and normalized roll number.
- `subjects`: owned by a teacher; indexed by teacher and normalized name.
- `importBatches`: normalized payload, checksum, validation report, lifecycle status, and expiry. It does not store the original binary.
- `attendanceRecords`: one logical status per student, subject, and attendance date, with the latest source import; indexed for subject dashboards and uniqueness checks.

Convex mutations must enforce relationships and logical uniqueness because these are application invariants rather than relational constraints. Student deactivation is preferred over deletion because it preserves attendance history.

## Request and data flow

1. `POST /api/session/demo` upserts the configured demo teacher and returns a signed, HTTP-only cookie.
2. Every protected route verifies the cookie and derives `teacherId`; client-provided teacher IDs are never accepted.
3. A Next.js preview endpoint validates file type/size and parses the first worksheet, then calls a Convex mutation to store the normalized payload and report as a pending batch that expires in 30 minutes.
4. A Convex mutation verifies and claims the pending batch. Convex mutation atomicity ensures invalid, expired, claimed, or confirmed batches make no domain changes.
5. Confirmation upserts roster rows or attendance records and marks the batch confirmed atomically. The implementation may cap batch size so one mutation stays within Convex limits.
6. A Convex query calculates or returns the source data for active-student dashboard risk results.

## Security model

The demo session is deliberately public and not production authentication. The cookie is signed, HTTP-only, `SameSite=Lax`, secure in production, and expires after 12 hours. All data access is scoped to the teacher ID from the verified cookie. Production deployments must set a long random `SESSION_SECRET`.

The backend validates upload extension and byte size before parsing. Validation reports are capped to prevent oversized responses and Convex documents, and workbook row/date limits constrain parsing work.

## Migration status

Convex is the required architecture, but its schema and functions are not yet present in this repository. Existing datastore-specific route internals are not the source of truth and must be replaced before deployment. The parser, validation, risk, and external API contracts should be preserved during that migration.
