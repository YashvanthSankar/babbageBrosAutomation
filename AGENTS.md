# Instructions for coding agents

Before changing this repository, read `docs/README.md` followed by
`docs/architecture.md`. Those files define the shared implementation contract,
data model, HTTP interfaces, and safety rules.

Key points:

- The canonical database schema is `db/schema.sql` and the access layer is
  `lib/db.ts` (node-postgres `Pool`). Do not introduce a second ORM/connection
  layer; the ingestion service (`lib/imports/service.ts`) writes through it.
- Authentication is NextAuth (`lib/auth.ts`) with a professor/admin session and
  roster-authorized students. Never accept an owner identity from a request body.
- Workbook/CSV parsing contracts live in `lib/imports/parser.ts` (`.xlsx`) and
  `lib/imports/csv.ts` (dashboard CSV). Keep validation behavior and tests in
  sync.
- Keep documentation synchronized with any interface, schema, command, or
  behavior change, and add a dated note under `docs/progress/`.
- Never commit credentials, `.env.local`, or uploaded student data.

The superseded `origin/upload` originals (Drizzle layer, JOSE demo session, and
Attendly docs) are archived verbatim under `docs/upload-branch/` for reference.
