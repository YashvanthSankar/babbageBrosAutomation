# Team working agreement

Every teammate adds a dated, short progress note under `docs/progress/` when their work changes an interface, configuration, or deployment step. Commit and push your own changes; pull before editing shared files. Never commit `.env`, student data, service credentials, or OAuth tokens.

Read `docs/architecture.md` before implementing integrations. The dashboard owner owns `app/` UI; the ingestion owner owns upload parsing and its API; the voice owner owns calling and its API. Agree changes to the shared contract before changing field names. Use feature branches when editing a shared file concurrently.

## Ingestion integration

The `origin/upload` branch (Attendly) was merged into `main`. Its import parser,
staged preview/confirm API, templates, and tests now live in `lib/imports/` and
`app/api/imports/`, adapted to this repository's canonical PostgreSQL schema
(`db/schema.sql`) and NextAuth admin session. The dashboard's existing Imports
tab (`/api/ingest/*`) is wired to the same service, so imported students and
attendance appear in `GET /api/dashboard`.

Gokul's original files that were superseded (Drizzle ORM layer, JOSE demo
session, and its docs) are preserved verbatim under `docs/upload-branch/` for
reference. See `docs/progress/2026-10-08-upload-merge.md` for the full mapping
and residual risks.

## Immediate deployment checklist

- VPS with Node 20+, PostgreSQL, HTTPS domain and DNS; set `DATABASE_URL` and `NEXTAUTH_URL` to the public HTTPS URL.
- Set `DATABASE_URL`, `NEXTAUTH_URL`, `NEXTAUTH_SECRET`, and the exact admin `PROFESSOR_EMAIL` on the VPS.
- Sign-in accepts a name, Indian E.164 phone, `@iiitdm.ac.in` email, and a non-empty demo password. Only the exact `PROFESSOR_EMAIL` sees the admin dashboard; all other institute emails see their own student dashboard.
- Show judges demo accounts/consent steps, and seed only synthetic student data. Validate the deployed flow from a clean browser.
