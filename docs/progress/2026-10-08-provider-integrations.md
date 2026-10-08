# Provider integration — 2026-10-08

- Credentials sign-in remains; professor name/phone and student profiles persist in Convex. Provider IDs are strings.
- Optional `google-professor` NextAuth provider: set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `TOKEN_ENCRYPTION_KEY` (or stable `NEXTAUTH_SECRET`), callback `https://YOUR_DOMAIN/api/auth/callback/google-professor`. OAuth email must equal `PROFESSOR_EMAIL`. Google Calendar API enabled in project `project-ba909057-8b45-4731-9b9`.
- Refresh tokens are AES-256-GCM encrypted on the VPS and stored in Convex. Connected slots merge Google FreeBusy and Convex reservations. Provider failure returns an error; unconnected slots are labeled local. Reservations use an atomic Convex mutation; connected bookings create Google events and mark reservations failed on provider error.
- `convex/integrations.ts`: `calendarTokens`, `bookings`, `notificationEvents`, protected with server-only `CONVEX_BACKEND_SECRET`. Convex stores data; VPS routes dispatch external requests.
- Import confirmation sends computed risk emails to student, professor and optional `FACULTY_ADVISER_EMAIL`. Configure `RESEND_API_KEY` and verified `RESEND_FROM_EMAIL`. Snapshot idempotency prevents duplicate dispatch.
- Attendance import dispatches OmniDimension on newly below-threshold transitions. Configure `OMNIDIM_API_KEY`, `OMNIDIM_AGENT_ID`, `OMNIDIM_FROM_NUMBER_ID`.
- Read-only verification: OmniDimension configured agent HTTP 200. Resend list endpoints HTTP 401 `restricted_api_key`: key is send-only; cannot inspect domains/delivery via these endpoints. No live send performed by this integration agent.
- Typecheck passed. OAuth/FreeBusy/event creation needs web-client configuration and professor consent; live Google connection untested.
