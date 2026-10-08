# Public demo Automation Center — 2026-10-08

- Added a professor Automation tab with provider readiness, explicit safe/live mode, sample roster/attendance/marks downloads, a short end-to-end test guide, and a refreshable recent-event feed.
- Added admin-only status/activity APIs backed by Convex notification events.
- Public/demo provider activity is now visibly simulated by default. Live test mode requires explicit server opt-in and pinned consented destinations; it never sends uploaded student contact/academic details and is capped at one send per provider per UTC day.
- Updated `.env.example`, architecture docs, and README with the public VPS URL and Google Drive demo folder supplied by the team.
- The team confirmed `https://automation.zapdos.me` is the hosted demo. Provider delivery remains simulated unless an operator explicitly enables and pins test destinations.
- Verification at original implementation: `npm run typecheck`, `npm test`, and `npm run build` passed. Current merge validation is recorded in the latest progress note.

- Public demo remains simulation-first. Live tests require explicit opt-in and pinned test destinations; no uploaded student data or contact is sent. Automatic voice activity is created on newly-below-threshold attendance imports and uses the same safe simulation/pinned-test policy.
