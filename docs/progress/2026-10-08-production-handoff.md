# Production progress — 2026-10-08

- Merged latest Gokul upload branch including Convex persistence and marks
  workbook parser, template, preview, and risk analysis.
- Professor/student dashboards and credential access use Convex document IDs.
- Production deployment verified: Denoise Labs / bb-automation /
  `groovy-sheep-854`, `https://groovy-sheep-854.convex.cloud`.
- Convex schema/functions deployed; automation executes in Next.js on the VPS.
- Added subject creation UI, fixed phone validation, and supplied Docker/Caddy
  deployment files.
- Typecheck, all 16 parser/risk tests, and production Next.js build pass.
- OmniDimension credential check passes. Resend recognizes a sending-only key;
  delivery is pending an allowed sender and controlled test. Calendar API is
  enabled; OAuth web-client credentials and professor consent remain required.
- VPS website deployment remains pending the SSH host and public DNS hostname.
  No live website deployment or successful provider delivery is claimed.
- Feature development paused at the user's request; runtime smoke checks
  continue after the main-branch push.
