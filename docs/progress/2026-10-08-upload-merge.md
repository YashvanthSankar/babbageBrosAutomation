# 2026-10-08 — Merge `origin/upload` (Attendly ingestion) into `main`

**Branches:** `main` @ `c92128f` (dashboard + NextAuth + calendar) merged with
`origin/upload` @ `32317a4` (backend-first attendance ingestion). Merge base
`3276f26`.

**Outcome:** a single app where the professor dashboard, roster-first imports,
parsed preview/confirm stages, marks, attendance risk, and the NextAuth calendar
backend coexist. The existing dashboard UI is unchanged.

## Conflict resolution policy

Current (`main`) versions were favored for shared files; Gokul's behavior was
ported on top and adapted to our PostgreSQL schema. Files kept from `main`:

`.env.example`, `.gitignore`, `README.md`, `app/api/dashboard/route.ts`,
`app/layout.tsx`, `app/page.tsx`, `docs/README.md`, `docs/architecture.md`,
`lib/api.ts` (extended with Zod handling), `lib/auth.ts`, `next-env.d.ts`,
`package.json`, `tsconfig.json`.

`lib/risk.ts` was merged: the dashboard's fixed-threshold helpers stay, and the
ingestion contract's `attendancePercentage` / `recoveryClasses` / `riskStatus` /
`compareRisk` were added so both callers and tests pass.

`package-lock.json` was regenerated with `npm install`.

## Ported from `upload` (adapted, not dropped)

| Upload file | Now in main | Adaptation |
| --- | --- | --- |
| `lib/imports/parser.ts` | same path | local validation types; integer subject IDs |
| `lib/imports/types.ts`, `http.ts` | same path | no ORM dependency; accepts `.csv` + `.xlsx` |
| `app/api/imports/roster/preview` | same path | NextAuth admin session, `import_batches` via pg |
| `app/api/imports/attendance/preview` | same path | same |
| `app/api/imports/[batchId]/confirm` | same path | atomic claim + upsert into our tables |
| `app/api/templates/{roster,attendance}` | same path | unchanged (ExcelJS) |
| `lib/risk.ts` helpers, `tests/*` | merged | integer IDs in fixtures |
| `vitest.config.ts` | same path | unchanged |

New integration code:

- `lib/imports/csv.ts` — CSV adapter for the dashboard's documented columns.
- `lib/imports/service.ts` — writes `students`, `subjects`, `attendance_records`,
  `test_results`, and `import_batches` through `lib/db.ts`.
- `app/api/ingest/{roster,attendance,marks}` — one-shot endpoints the existing
  `components/UploadsPanel.tsx` already calls.
- `app/api/students`, `app/api/subjects` — professor-scoped CRUD (roster-first
  and subject selection), adapted to integer IDs and `professor_email`.
- `app/api/health` — pg-based readiness check.

## Schema changes (`db/schema.sql`, idempotent)

- `students.active BOOLEAN NOT NULL DEFAULT true`.
- `subjects.threshold INTEGER NOT NULL DEFAULT 85` (check 1–99).
- new `import_batches` table (staged previews; JSONB payload/report; 30-minute
  expiry; single-use status lifecycle).

## How imports reach the dashboard

`/api/ingest/*` and `/api/imports/*/confirm` both funnel into
`lib/imports/service.ts`, which upserts into `attendance_records`
(`present` boolean) and `students` (`professor_email`). `GET /api/dashboard`
already reads those tables, so imported students and attendance appear in the
existing professor/student views with no UI change.

## Superseded originals (preserved)

Gokul's Drizzle ORM layer (`lib/db/index.ts`, `lib/db/schema.ts`,
`drizzle.config.ts`), the JOSE demo session (`lib/auth.ts` original,
`app/api/session/*`), `scripts/seed.ts`, `next.config.ts`, and all Attendly docs
are archived verbatim under `docs/upload-branch/`. Nothing was deleted from the
branch history.

## Verification

- `npm install`
- `npm run typecheck`
- `npm run build`
- `npm test`

## Residual risks / follow-ups

1. **Single-professor model.** `students.roll_no` and `students.email` are
   globally unique (pre-existing), not per professor. Roster imports with a
   duplicate roll number or email update the existing row rather than scoping by
   `professor_email`. Acceptable for the one-professor MVP; revisit for
   multi-professor.
2. **CSV vs `.xlsx` contract.** `.xlsx` stays strict (P/A only, per
   `docs/upload-branch/docs/import-contracts.md`); the dashboard CSV adapter is
   intentionally more permissive (`present/absent`, `1/0`). Both share the same
   persistence path.
3. **Marks are CSV-only.** The dashboard's marks upload is implemented against
   `test_results`; there is no `.xlsx` marks parser yet.
4. **No live DB smoke test.** Endpoints were validated by typecheck/build/unit
   tests only; run the documented flow against a real `DATABASE_URL` before
   deploying.
5. **Threshold display.** `subjects.threshold` is stored and used by the
   ingestion risk helpers, but the dashboard still computes risk at the fixed
   85/90 bands. Wiring the per-subject threshold into `lib/dashboard.ts` is a
   follow-up.
