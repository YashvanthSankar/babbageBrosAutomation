# AI agent guide

This is the operational handoff for coding agents. Read `docs/README.md`, `docs/product-spec.md`, `docs/architecture.md`, `docs/import-contracts.md`, and `docs/api-reference.md` before changing behavior.

## Current mission and boundaries

The current deliverable is a backend-first MVP. Do not build a frontend unless the user explicitly reintroduces that scope. Do not add marks, AI analysis, email, phone calls, timetable integrations, weekly jobs, multi-class hierarchy, or production authentication without a new requirement.

## Sources of truth

- Database schema and uniqueness: `lib/db/schema.ts`.
- Workbook formats and cell validation: `lib/imports/parser.ts`.
- Staged import creation: `lib/imports/http.ts`.
- Atomic confirmation and upsert behavior: `app/api/imports/[batchId]/confirm/route.ts`.
- Risk formulas and ordering: `lib/risk.ts`.
- JSON input rules: `lib/validation.ts`.
- External API contract: `docs/api-reference.md`.

When code and documentation disagree, treat it as a defect. Determine intended behavior from the product specification, fix the code or docs, and record the change in this guide’s status section.

## Invariants

1. Never accept a teacher ID from the client. Derive it from the signed session.
2. Scope every teacher-owned lookup and mutation by that teacher ID.
3. Preview may write only an `import_batches` staging record; it must not change students or attendance.
4. A batch with errors cannot be confirmed.
5. Confirmation must claim and apply a batch in one transaction. A batch is single-use and expires after 30 minutes.
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
- If the schema changed, run `npm run db:generate` and inspect the SQL migration.
- Update every affected document, including API examples and environment variables.
- Update the implementation-status checklist below.

## Implementation status

- [x] Drizzle/PostgreSQL schema and migration source.
- [x] Signed one-click demo session.
- [x] Teacher-scoped student CRUD.
- [x] Teacher-scoped subject CRUD.
- [x] Roster `.xlsx` template, parser, preview, and confirmation.
- [x] Attendance `.xlsx` template, parser, preview, and correction-safe confirmation.
- [x] Risk calculation and sorted dashboard-data API.
- [x] Health endpoint.
- [x] Parser and risk unit tests.
- [ ] Verification against the collaborator-provided PostgreSQL database.
- [ ] Hosted deployment and live smoke test.
- [ ] Teacher-facing frontend, currently out of scope.

## Known limitations and next priorities

1. Connect the supplied PostgreSQL database, migrate it, seed the demo teacher, and perform the documented API smoke test.
2. Add database integration tests using an isolated PostgreSQL database, including atomic rollback, single-use confirmation, correction upserts, and cross-teacher access.
3. Deploy to the selected host and verify upload limits under that provider.
4. Only after an explicit scope change, build a client against `docs/api-reference.md`.

## Definition of done

A backend change is complete when behavior matches the product/import contracts, teacher ownership and transactional invariants remain intact, tests and production build pass, schema changes have migrations, no secrets or personal data are committed, and all affected documentation is current.

## Manual smoke test

Follow `docs/development.md#verification`. Confirm additionally that an unknown roll blocks attendance confirmation, a blank cell creates no attendance record, the same batch cannot be confirmed twice, a second upload corrects an existing status, and a subject ID from another teacher returns not found.
