# Latest Gokul merge and Convex production — 2026-10-08

Fetched origin/upload at 4f0e175 (convex and marks upload), retaining both branch histories. The user explicitly requested the ready Convex production project; canonical persistence changed from PostgreSQL to Convex with NextAuth retained.

Preserved Gokul's Convex schema/functions, marks workbook parser, marks risk helper/tests, marks template and preview/dashboard routes. Adapted routes to session-derived professor identity and connected dashboard CSV imports to the same atomic Convex import service. String Convex IDs are preserved. Roster import now reconciles a login-created student by owner/email and refuses roll/email conflicts.

Latest conflicting branch originals are preserved under docs/upload-branch/latest. The prior PostgreSQL schema remains reference; no database reset or destructive data migration was performed.

Parser/risk verification: 16 tests pass. Production deployment and combined provider checks are being coordinated by the main agent.
