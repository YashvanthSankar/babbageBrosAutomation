# Team working agreement

Read [architecture.md](architecture.md) for the shared implementation contract. Teammates record dated progress under docs/progress. Never commit environment secrets or uploaded student data.

## Current implementation

Gokul's latest upload commit 4f0e175 is merged with the professor/student dashboard and NextAuth session. Convex is the shared production database; the app and email/voice/calendar automation run from the VPS. PostgreSQL files are historical reference, not the live database.

The workbook parser supports roster, attendance and marks previews. Confirmation applies an entire batch atomically, once, with a 30-minute expiry. Dashboard imports accept CSV, and Excel for roster, attendance and marks; Excel marks need assessment metadata. Re-imports update existing attendance and test records.

## Deployment

Configure CONVEX_DEPLOYMENT, NEXT_PUBLIC_CONVEX_URL, CONVEX_BACKEND_SECRET, NEXTAUTH_URL, NEXTAUTH_SECRET and exact PROFESSOR_EMAIL on the VPS. The backend secret must match Convex and is never exposed through a public variable. Production project: Denoise Labs / bb-automation, deployment groovy-sheep-854. Provider credentials are configured separately.

Sign-in collects name, phone, institute email and a nonempty demo password. Only the configured professor address gets admin access. Student record reads always derive email from the session. Provider verification and deployed end-to-end status are recorded in progress notes.

Email, weekly aggregate digests, and conditional adviser escalation default to recorded simulations. Optional live provider tests use fixed synthetic messages and server-pinned consenting recipients. See [the decision matrix](workflow-choice.md), [API contracts](api-reference.md), and [the 2026-10-09 progress and remaining work](progress/2026-10-09-email-and-weekly.md). Do not claim live inbox receipt or connected Calendar without a hosted end-to-end check.
