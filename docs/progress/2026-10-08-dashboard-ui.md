# Dashboard UI work log — 2026-10-08

Frontend-only work for the dashboard owner.

## Files added

- `app/layout.tsx` — App Router root layout, metadata/viewport, wraps children in the client `Providers` session context.
- `app/page.tsx` — renders the client `Dashboard`.
- `app/globals.css` — self-contained design system (light + `prefers-color-scheme: dark`): cards, stats, tables, forms, badges, alerts, progress bars, slots, stepper, spinner/skeleton, responsive layout.
- `components/Providers.tsx` — `"use client"` `SessionProvider` wrapper.
- `components/Dashboard.tsx` — session gate (`useSession`, `signIn`, `signOut`), landing, `GET /api/dashboard` fetch, role routing, error/loading states.
- `components/AdminDashboard.tsx` — professor overview: server stats (fallback to values computed from the live roster), searchable roster/risk table, tabbed imports.
- `components/UploadsPanel.tsx` — roster-first stepper for `POST /api/ingest/roster|attendance|marks`, subject selector, drag-and-drop CSV, per-row error rendering.
- `components/StudentDashboard.tsx` — per-subject attendance, latest/previous score percentages, trend, recovery classes, summary stats.
- `components/BookingPanel.tsx` — `GET /api/calendar/slots` + `POST /api/calendar/book`, with calendar connection honesty.
- `components/ui.tsx`, `components/types.ts`, `components/helpers.ts`, `components/api.ts` — shared primitives, contract types, derived-risk helpers, fetch wrapper.

No shared/teammate files were modified (`package.json`, `lib/`, `app/api/`, `db/schema.sql`, `docs/architecture.md` untouched). `node_modules`/`package-lock.json` were created by `npm install` for verification only.

## Contracts verified against teammate code

Read `lib/dashboard.ts`, `lib/risk.ts`, `lib/api.ts`, `lib/auth.ts`, `app/api/dashboard/route.ts`, `app/api/calendar/slots/route.ts`, `app/api/calendar/book/route.ts` and aligned the UI:

- **Auth uses two Google providers**: `google` (student, profile/email) and `google-professor` (adds Calendar scopes). The landing offers **both** sign-in buttons so the professor can grant Calendar consent; booking is impossible without the professor provider.
- **Errors** are `{ error: { code, message, details? } }`; `components/api.ts` extracts `error.message`.
- **Dashboard**: admin `{role:'admin', professor:{email,name}, stats:{students,subjects,atRisk}, students:[…]}`; student `{role:'student', professor, student}`. `stats` is preferred for the stat cards, with roster-derived fallback. `riskLevel` ∈ `high|warn|ok|unknown` drives the risk badge (`unknown` = "No data", not at-risk).
- **Scores are percentages** (`lib/risk.ts` `scorePercent`), so they render as `NN%`; `trend` comes from the backend when present.
- **Slots** response also carries `calendarConnected`, `source`, `warning`; the booking panel surfaces these (e.g. "Limited availability — Google Calendar not connected") instead of implying live calendar data.
- `SubjectStat` also carries `latestTestName`; shown under the score metrics.

## Still to confirm with the ingestion owner (routes not implemented yet)

- Uploads are sent as `multipart/form-data` with the CSV in the `file` field and, for attendance/marks, the subject in the `subjectId` field; the response is read as `{imported, updated, errors:[{row,message}]}`. If the route expects different field names, only `UploadsPanel.submit` needs changing.
- Subjects for the attendance/marks selector and student booking are derived from the deduped `subjects[]` in `GET /api/dashboard`; if none exist yet, the UI falls back to a free-text `subjectId` input.

## Honest states (no fake live data)

- Unauthenticated → landing with both Google sign-ins and an explicit note that OAuth must be configured server-side.
- Session present but API fails/404 (ingest routes not deployed) → error card with the server message, a retry, and a note that nothing is shown live until the server responds.
- Calendar slots failure / not connected → "Availability unavailable" / "Limited availability" with the server warning and a retry; never invented slots.
- Empty roster/subjects/slots → dedicated empty states.

## Verification

- `npm run typecheck` (`tsc --noEmit`) → clean, 0 errors.
- `npm run build` (`next build`) → compiled successfully; `/` prerendered as static (10.8 kB, 108 kB First Load JS). Teammate routes `/api/auth/[...nextauth]`, `/api/calendar/book`, `/api/calendar/slots`, `/api/dashboard` all compiled as dynamic.
- Note: `/api/ingest/*` do not exist yet, so uploads currently return the UI's honest error state.

Not committed/pushed (shared filesystem).
