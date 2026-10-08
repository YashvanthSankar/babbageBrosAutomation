# Public demo Automation Center — 2026-10-08

- Added a professor Automation tab with provider readiness, explicit safe/live mode, sample roster/attendance/marks downloads, a short end-to-end test guide, and a refreshable recent-event feed.
- Added admin-only status/activity APIs backed by Convex notification events.
- Public/demo provider activity is now visibly simulated by default. Live test mode requires explicit server opt-in and pinned consented destinations; it never sends uploaded student contact/academic details and is capped at one send per provider per UTC day.
- Updated `.env.example`, architecture docs, and README link placeholders for the public VPS and Google Drive demo video. Actual public URLs remain to be supplied.
- Verification: `npm run typecheck`, `npm test`, and `npm run build` pass. No VPS deployment or public URL has been verified in this change.
