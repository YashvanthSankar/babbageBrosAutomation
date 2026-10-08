# Team working agreement

Read [architecture.md](architecture.md) for the shared implementation contract. Teammates record dated progress under docs/progress. Never commit environment secrets or uploaded student data.

## Current implementation

Gokul's latest upload commit 4f0e175 is merged with the professor/student dashboard and NextAuth session. Convex is the shared production database; the app and email/voice/calendar automation run from the VPS. PostgreSQL files are historical reference, not the live database.

The workbook parser supports roster, attendance and marks previews. Confirmation applies an entire batch atomically, once, with a 30-minute expiry. Dashboard imports accept CSV, and Excel for roster, attendance and marks; Excel marks need assessment metadata. Re-imports update existing attendance and test records.

## Deployment

Configure CONVEX_DEPLOYMENT, NEXT_PUBLIC_CONVEX_URL, CONVEX_BACKEND_SECRET, NEXTAUTH_URL, NEXTAUTH_SECRET and exact PROFESSOR_EMAIL on the VPS. The backend secret must match Convex and is never exposed through a public variable. Production project: Denoise Labs / bb-automation, deployment groovy-sheep-854. Provider credentials are configured separately.

Sign-in collects name, phone, institute email and a nonempty demo password. Only the configured professor address gets admin access. Student record reads always derive email from the session. Provider verification and deployed end-to-end status are recorded in progress notes.

Email, weekly aggregate digests, and conditional adviser escalation default to recorded simulations. Optional live provider tests use fixed synthetic messages and server-pinned consenting recipients. See [the decision matrix](workflow-choice.md), [the hackathon story and its evidence boundary](progress/2026-10-09-hackathon-story.md), [API contracts](api-reference.md), [the email implementation note](progress/2026-10-09-email-and-weekly.md), [the integration audit and its follow-up](progress/2026-10-09-integration-audit.md), and [the redacted booking/Calendar screenshot note](progress/2026-10-09-calendar-demo-screenshots.md). The team reports working Resend email and OmniDimension call demos; no provider log or recipient receipt was independently inspected here. The hosted weekly manual route now returns 401 without a session rather than the original 404, but no authorized run has been verified; cron returned 503 without its required configuration. Matching user-provided booking and Calendar images are not a logged OAuth or FreeBusy test. Do not claim independently verified live inbox receipt or a fully verified Calendar integration without a hosted end-to-end check.
