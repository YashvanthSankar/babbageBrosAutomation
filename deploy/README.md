# Deploy to the VPS

Convex production is `https://groovy-sheep-854.convex.cloud` in Denoise Labs's
`bb-automation` project. The VPS runs Next.js and provider requests.

1. Point a DNS hostname at the VPS. Open TCP ports 80 and 443.
2. Install Docker and Compose; clone the repository.
3. Run `cp .env.example .env.production` and edit the ignored `.env.production`. Set
   `NEXTAUTH_URL=https://YOUR_DOMAIN`, the production Convex URL, the existing
   `CONVEX_BACKEND_SECRET`, and a generated `NEXTAUTH_SECRET`.
4. Set professor, email, voice, and optional Calendar credentials.
5. Run `docker compose --env-file .env.production up --build -d`. Set
   `APP_DOMAIN=YOUR_DOMAIN` inside `.env.production`; use an actual DNS hostname.
6. Check `/api/health`, sign in, add a subject, import the roster and subject
   results, then verify student access and appointments.

Calendar OAuth requires a web client with redirect URI
`https://YOUR_DOMAIN/api/auth/callback/google-professor`. Set
`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `GOOGLE_CALENDAR_ACCOUNT` to the
exact email of an explicitly approved demo Google account; the professor must authorize
that account from the admin dashboard. Add the account as an OAuth test user if
the consent screen is in Testing. The connection page shows which account is
configured. A personal primary calendar will receive demo bookings if explicitly connected; prefer a separate demo account.
Public provider automation defaults to simulation. For a controlled live test, set `DEMO_LIVE_AUTOMATIONS=true`, configure provider credentials, and pin consenting `DEMO_AUTOMATION_EMAIL` and/or `DEMO_AUTOMATION_PHONE` destinations for import-triggered actions and weekly summaries. Resend's `onboarding@resend.dev` sandbox sender delivers only to the Resend account owner's inbox; use a verified sending domain for other consenting inboxes. Live test messages and calls use fixed synthetic content and never use uploaded student addresses, phone numbers, or academic details. The manual email and call cards accept an entered contact and attempt live dispatch with an ordinary professor session; each manual demo has its own daily durable claim, separate from import-triggered automation. Weekly digest and adviser escalation use separate ISO-weekly claims. Provider acceptance does not prove an email was read or a call was answered.

For **manual email and call tests**, the professor dashboard cards accept an entered contact and attempt live dispatch directly — no separate opt-in flag, Google verification, consent checkbox, pinned recipient, or readiness preflight. A manual email accepts one syntactically valid address; calls accept one international E.164 number (including Indian `+91` mobiles). Each provider has up to ten durable live attempts per professor per UTC day, including failures. A same-day pre-migration pending/failed/dispatched attempt still blocks live sends for that day. Missing provider credentials return an error; Resend still imposes sandbox/domain restrictions and OmniDimension controls destination availability, so a successful request is not inbox receipt or an answered call. No recipient data is persisted in Convex aggregate activity. Removing application preflights does not remove provider requirements — verify your sender domain with Resend before testing. Public demo-password access is **not** production identity verification or consent management; collect real recipient consent yourself before any live test.

To schedule the weekly aggregate digest, generate a long random `CRON_SECRET` on the VPS (`openssl rand -hex 32`) and place it **only** in ignored `.env.production`. Configure `FACULTY_ADVISER_EMAIL` to enable the conditional adviser action. Public mode records simulations even if Resend is configured. For an optional live adviser test, the adviser email must match the consenting `DEMO_AUTOMATION_EMAIL`; otherwise it remains simulated. A live digest also goes only to that pinned inbox and contains fixed synthetic text, not actual cohort counts. The dashboard can run the digest manually. To run it every Monday at 09:00 UTC, install a VPS cron entry (not bundled with the application), for example:

```sh
0 9 * * 1 /path/to/private/weekly-job.sh
```

In the private script, read `CRON_SECRET` from the VPS environment and POST with `Authorization: Bearer $CRON_SECRET` to `https://YOUR_DOMAIN/api/automation/weekly/cron`; do not put the secret in the crontab command, Git, or shell history. The job is idempotent per ISO week; failures are visible in Automations but are not automatically retried that week. After deploying new Convex schema/functions, deploy the matching Next.js code; otherwise new routes will fail.
Never store environment secrets or uploaded student files in Git.

The previously released Convex functions are deployed, but the manual-send claim migration adds an optional `legacyKey` argument. Deploy the updated `convex/integrations.ts` function to the intended Convex deployment **before** releasing the matching Next.js version; until then the new manual live claims will be rejected by the older validator. A VPS clone does not
need Convex CLI account credentials: the app uses the public deployment URL
and matching server backend secret. Put provider keys into `.env.production`
only when enabling those integrations. To update: `git pull --ff-only` then
run the same Compose command. View startup failures with
`docker compose --env-file .env.production logs --tail=100 app`.
