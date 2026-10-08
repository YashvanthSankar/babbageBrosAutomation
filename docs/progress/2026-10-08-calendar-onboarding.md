# Calendar onboarding and marks Excel — 2026-10-08

- Added a professor-only Calendar setup endpoint and a dashboard account-choice dialog. OAuth is allowlisted to `GOOGLE_CALENDAR_ACCOUNT`, then mapped back to the application professor session; the server reports setup status without exposing tokens.
- Added dashboard Excel marks import using the workbook parser. It requires selected subject, assessment name/date, and maximum marks; CSV marks remain unchanged.
- Production Convex functions were deployed; read-only check of `integrations:recentNotifications` succeeded (40 recent events returned, no student details printed).
- Verification: 28 tests, typecheck, and Next production build passed. Public homepage and health returned HTTP 200. Public Calendar-connection and Automation-status routes returned HTTP 404, indicating the VPS still needs the new app revision deployed. Google OAuth consent and a real Calendar booking have not been exercised.
- **Credential safety:** rotate/replace the OAuth client secret before use; configure only the replacement on the VPS. Set `GOOGLE_CALENDAR_ACCOUNT` to a dedicated demo account and match `NEXTAUTH_URL` to the OAuth redirect URI. Do not connect a personal primary calendar or use real student data.
- Current limits: Calendar access still requires an interactive Google consent step; weekly summaries remain unimplemented; public email/call automation remains simulated unless explicitly opted into pinned test destinations.
