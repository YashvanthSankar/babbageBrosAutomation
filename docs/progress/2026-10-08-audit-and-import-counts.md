# Audit, import counts and remaining setup — 2026-10-08

## Changed in this step

- `convex/backend.ts` `confirmImport` counts records written during a confirmed batch: `inserted` for new roster students, attendance records and marks records; `updated` for existing ones. Assessments are not counted. Deployed to production Convex `groovy-sheep-854`.
- `lib/imports/service.ts` now returns those real counts. Previously `updated` was always `0`. The dashboard import result shows imported and updated counts from the same values.
- Removed the empty `app/api/voice/demo-call` directory left from the earlier unsafe endpoint removal.

## Validation

- `npm test`: 28 tests passed across 6 suites.
- `npm run typecheck`: clean.
- Production Convex deploy: succeeded; no indexes deleted.

## Audit status

| Area | Status | Evidence / gap |
|---|---|---|
| Roster, attendance, marks imports (CSV, Excel for all three) | Implemented | Staged preview/confirm and dashboard one-shot endpoints share the same atomic confirm. Import counts now real. |
| Attendance and marks risk | Implemented, tested | Risk tests pass; recovery formula per `docs/architecture.md`. |
| Professor and student dashboards | Implemented | Session-scoped; student data derived from session email. |
| In-app appointment booking | Implemented, tested locally | Collision rejection verified earlier. |
| Google Calendar connection | Code implemented; not live | Requires rotated OAuth secret, `GOOGLE_CALENDAR_ACCOUNT`, VPS deploy, and a consent step. Public `/api/calendar/connection` returns 404 until the VPS runs this code. |
| Email warnings | Simulated by default; pinned live test path implemented | Live only with `DEMO_LIVE_AUTOMATIONS=true`, Resend sender, and a pinned `DEMO_AUTOMATION_EMAIL`. Live inbox receipt not verified. |
| Automatic attendance call | Simulated by default; pinned live test path implemented | Triggered only on a newly below-threshold attendance import. Live only to a pinned `DEMO_AUTOMATION_PHONE`. Provider acceptance is not proof of an answered call. |
| Weekly summary | Not implemented | `/api/automation/status` reports `weeklySummary.configured: false` as a fixed value. |
| Faculty adviser alert | Not implemented | `FACULTY_ADVISER_EMAIL` exists in `.env.example` but no code reads it. |
| Public status endpoint | Returns 404 on the public site | Expected until the VPS runs the latest commit. |

## Keys

Names only; values were not read or printed.

Present locally in `.env.local`: `CONVEX_DEPLOYMENT`, `NEXT_PUBLIC_CONVEX_URL`, `CONVEX_BACKEND_SECRET`, `NEXTAUTH_URL`, `NEXTAUTH_SECRET`, `PROFESSOR_EMAIL`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` (**exposed earlier; rotate before use**), `RESEND_API_KEY`, `OMNIDIM_API_KEY`, `OMNIDIM_AGENT_ID`, `OMNIDIM_FROM_NUMBER_ID`.

Still needed:

- `GOOGLE_CALENDAR_ACCOUNT`: exact email of a dedicated demo Google account. Not a personal calendar.
- `GOOGLE_CLIENT_SECRET`: replacement value after rotation (the current one is exposed).
- `RESEND_FROM_EMAIL`: a sender on a verified Resend domain.
- `DEMO_AUTOMATION_EMAIL`: a pinned consenting test inbox, only for live tests.
- `DEMO_AUTOMATION_PHONE`: a pinned consenting E.164 test number, only for live tests.
- `FACULTY_ADVISER_EMAIL`: needed only once the adviser alert is built.
- `TOKEN_ENCRYPTION_KEY`: optional; falls back to `NEXTAUTH_SECRET`. Set a separate value for production.
- `CRON_SECRET`: needed only once a scheduled weekly summary endpoint exists.
- `APP_DOMAIN`: optional, documentation only.

Keep `DEMO_LIVE_AUTOMATIONS=false` for the public demo.

## Open items

1. Weekly summary: aggregate-only, simulated by default, idempotent per ISO week, with a manual admin trigger and a cron trigger. Needs a schema change to store aggregate notifications.
2. Faculty adviser alert: counts only, simulated by default, live only to the pinned inbox.
3. `/api/automation/status`: replace the fixed `weeklySummary` value with real readiness.
4. Rewrite stale docs: `docs/agent-guide.md` (still describes a backend-first MVP that forbids email and calls), `docs/product-spec.md`, `docs/development.md`, `docs/import-contracts.md`, and the README and `deploy/README.md` lines that say weekly summaries are not implemented.
5. Tests for the weekly summary, cron authentication, adviser safety, and the import-count mapping.

Items 1–5 are not done in this step.

## Actions the operator must take

1. Rotate the Google OAuth client secret in Google Cloud Console (project `iiitdm-attend`).
2. Choose the dedicated demo Google account and set `GOOGLE_CALENDAR_ACCOUNT` to its exact email.
3. Set the new `GOOGLE_CLIENT_SECRET`, `GOOGLE_CALENDAR_ACCOUNT`, and `NEXTAUTH_URL` on the VPS.
4. Deploy the latest `main` commit to the VPS.
5. Sign in as the professor, connect the dedicated Calendar account, and grant consent in a browser.
