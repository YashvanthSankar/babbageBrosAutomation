# Dashboard and origin/main merge — 2026-10-08

- Fetched origin/main and reconciled its changes with the existing local main history. Preserved concurrent automation work per the user’s explicit choice: simulation by default and optional pinned-recipient live tests; no arbitrary-number demo-call route.
- Faculty dashboard and home page redesigned in the selected minimal white style, with larger headings, quieter borders, restrained risk colors, clear recovery plans and eight students per page.
- Professor Calendar connection action, student booking and backend Calendar functionality are preserved.
- A separate port 3001 preview directory prevents multiple local servers sharing compiled output.
- Home page, demo shortcut, professor sign-in, dashboard rendering and student search verified visually on localhost. Live provider delivery was not attempted. The existing deployed Convex notification feed returned a server error during preview and needs deployment verification.
- Final tests, typecheck and production build recorded below after the merge review.

- Validation: 28 tests passed; TypeScript and production build passed. Fetched origin/main at `caa39ff`; its commit is the merge parent. Preview remains available on http://localhost:3001.
