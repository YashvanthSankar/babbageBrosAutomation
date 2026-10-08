# Email safety, aggregate automation and next steps — 2026-10-09

## Implemented locally (not yet a claim of hosted delivery)

- Fast-forwarded the clean local checkout to `5a3915b` before editing. Its manual demo-email route previously accepted arbitrary typed recipients with process-memory rate limits; that is unsafe with impersonable demo credentials. It now simulates by default, rejects an arbitrary recipient field and requires a server-pinned consenting test inbox for optional live sends. Its limit is a Convex-backed one-attempt-per-professor-per-UTC-day claim. The dashboard no longer requests an email address and distinguishes simulation from provider acceptance.
- Added Convex `aggregateEvents` with atomic professor-scoped claims, aggregate-only recent events, and cohort counts derived from active students, subjects, attendance and assessment percentages. Added a professor-only manual weekly trigger and a separately Bearer-authenticated cron trigger; both deduplicate on the ISO week-year. Conditional adviser escalation requires at-risk students and `FACULTY_ADVISER_EMAIL`. By default both actions are simulations; live tests require explicit opt-in, Resend setup and a pinned consenting inbox. Adviser live tests require the configured adviser email to match that inbox. Outbound text is synthetic and never includes uploaded student data or cohort counts. Provider failures are recorded, not silently marked delivered. Failed-attempt retry is intentionally deferred to avoid duplicates when a provider response is uncertain.
- Updated the faculty activity/status panel, API docs, architecture, deployment notes, README, and the evidence-based [workflow-platform comparison](../workflow-choice.md).
- Checked locally: `npm test` passed 51 tests across 10 files; `npm run typecheck` passed; `npm run build` completed successfully; `git diff --check` clean.
- Deployed the additive `aggregateEvents` schema and functions to production Convex (`groovy-sheep-854`). Convex reported two new indexes and no deleted indexes. This does **not** deploy the Next.js VPS application.

## Remaining release checklist (priority order)

- [x] Deploy matching Convex schema/functions to production (no destructive index changes).
- [ ] Deploy matching Next.js app on the VPS; verify new routes from an authenticated professor session. Neither local tests nor a 401 without a session prove hosted flows work.
- [ ] Set `CRON_SECRET` only on VPS and create a private weekly scheduler entry; verify manual and cron calls in safe simulation mode and verify next call in same week reports `already_run`.
- [ ] If desired, configure a **consenting** `DEMO_AUTOMATION_EMAIL`. For the Resend sandbox, this must be the account owner's inbox; other destinations need a verified sending domain. Keep `DEMO_LIVE_AUTOMATIONS=false` on the public demo unless intentionally testing. Verify provider acceptance **and** inbox receipt before claiming live email delivery. A manual/weekly claim is consumed by a failed or uncertain send and will not resend that day/week.
- [ ] Rotate the exposed Google OAuth client secret, set matching credentials and the approved Calendar account on VPS, verify `google-professor` appears in `/api/auth/providers`, complete consent, and test availability + one booking; the current live provider list showed only `demo-credentials` before this change.
- [ ] Add integration tests against a disposable Convex backend and authenticated hosted smoke tests. Current unit tests mock Convex and Resend; they do not prove deployed delivery. Confirm the external scheduler is monitored, and review Convex query performance for larger cohorts.
- [ ] Replace the impersonable credentials demo auth before handling real student records. Keep all public-demo records synthetic until then.

## Honest demonstration claim

The app implements import validation, explainable risk, booking, and safety-gated downstream automation. It is not a benchmark against Zapier, n8n, or Make. Show simulations as simulations and provider acceptance as provider acceptance; never describe either as confirmed delivery.
