# Team working agreement

Every teammate adds a dated, short progress note under `docs/progress/` when their work changes an interface, configuration, or deployment step. Commit and push your own changes; pull before editing shared files. Never commit `.env`, student data, service credentials, or OAuth tokens.

Read `docs/architecture.md` before implementing integrations. The dashboard owner owns `app/` UI; the ingestion owner owns upload parsing and its API; the voice owner owns calling and its API. Agree changes to the shared contract before changing field names. Use feature branches when editing a shared file concurrently.

## Immediate deployment checklist

- VPS with Node 20+, PostgreSQL, HTTPS domain and DNS; set `DATABASE_URL` and `NEXTAUTH_URL` to the public HTTPS URL.
- Google OAuth web client with callback `https://YOUR_DOMAIN/api/auth/callback/google`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `NEXTAUTH_SECRET`.
- Professor must sign in and grant Calendar permission; configure `PROFESSOR_EMAIL`. Students must sign in with Google using a verified `@iiitdm.ac.in` email **and** have their email in the professor's student roster.
- Show judges demo accounts/consent steps, and seed only synthetic student data. Validate the deployed flow from a clean browser.
