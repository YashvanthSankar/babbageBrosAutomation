# AI agent guide

This is the operational handoff for coding agents. Read `docs/README.md`, `docs/product-spec.md`, `docs/architecture.md`, `docs/import-contracts.md`, and `docs/api-reference.md` before changing behavior.

## Current mission and boundaries

The current deliverable is a backend-first MVP. Do not build a frontend unless the user explicitly reintroduces that scope. Marks ingestion and deterministic weak/falling analysis are in scope; AI explanations, email, phone calls, timetable integrations, weekly jobs, multi-class hierarchy, and production authentication are not.

## Sources of truth

- Convex schema and indexes: `convex/schema.ts`.
- Convex queries and atomic mutations: `convex/backend.ts`.
- Workbook formats and cell validation: `lib/imports/parser.ts`.
- Staged import creation: `lib/imports/http.ts`.
- Atomic confirmation and upsert behavior: `confirmImport` in `convex/backend.ts`.
- Risk formulas and ordering: `lib/risk.ts`.
- Marks flags and ordering: `lib/marks-risk.ts`.
- JSON input rules: `lib/validation.ts`.
- External API contract: `docs/api-reference.md`.

When code and documentation disagree, treat it as a defect. Determine intended behavior from the product specification, fix the code or docs, and record the change in this guide’s status section.

## Invariants

1. Never accept a teacher ID from the client. Derive it from the signed session.
2. Scope every teacher-owned lookup and mutation by that teacher ID.
3. Preview may write only an `import_batches` staging record; it must not change students or attendance.
4. A batch with errors cannot be confirmed.
5. Confirmation must claim and apply a batch in one atomic Convex mutation. A batch is single-use and expires after 30 minutes.
6. Attendance uniqueness is student + subject + date. Re-imports update rather than duplicate.
7. Blank attendance is unrecorded, not absent.
8. Do not silently accept aliases or change workbook headers, status values, thresholds, watch-band width, formulas, or import limits. Update tests and docs with any approved contract change.
9. Do not store original workbook binaries or log student workbook contents.
10. Never place credentials or real student data in code, tests, documentation, or commits.

## Required workflow

Before editing:

- Check `git status` and preserve unrelated work.
- Read the relevant source-of-truth module and tests.
- Confirm the requested change is inside the documented scope.

After material work:

- Run `npm test`.
- Run `npm run build`.
- If the schema changed, run Convex code generation and inspect the generated types.
- Update every affected document, including API examples and environment variables.
- Update the implementation-status checklist below.

## Implementation status

- [x] Convex schema, indexes, and API function references.
- [x] Signed one-click demo session backed by Convex.
- [x] Teacher-scoped student CRUD backed by Convex.
- [x] Teacher-scoped subject CRUD backed by Convex.
- [x] Roster `.xlsx` template, parser, and validation contract.
- [x] Attendance `.xlsx` template, parser, and validation contract.
- [x] Convex staging and atomic confirmation for roster, attendance, and marks.
- [x] Risk calculation and ordering logic.
- [x] Convex-backed attendance/marks dashboard-data and health endpoints.
- [x] Parser and risk unit tests.
- [ ] Verification against the team Convex deployment.
- [ ] Hosted deployment and live smoke test.
- [ ] Teacher-facing frontend, currently out of scope.

## Known limitations and next priorities

1. Run `npx convex dev` against the team deployment, set the shared backend secret, and perform the documented API smoke test.
2. Add Convex integration tests covering atomic failure, single-use confirmation, attendance/marks correction upserts, and cross-teacher access.
3. Deploy to the selected host and verify upload limits under that provider.
4. Only after an explicit scope change, build a client against `docs/api-reference.md`.

## Definition of done

A backend change is complete when behavior matches the product/import contracts, teacher ownership and atomic-mutation invariants remain intact, tests and production build pass, Convex schema changes have refreshed generated types, no secrets or personal data are committed, and all affected documentation is current.

## Manual smoke test

Follow `docs/development.md#verification`. Confirm additionally that unknown rolls block attendance and marks confirmation, blanks create no records, the same batch cannot be confirmed twice, second uploads correct existing attendance/scores, weak and falling flags follow the documented thresholds, and a subject ID from another teacher returns not found.
