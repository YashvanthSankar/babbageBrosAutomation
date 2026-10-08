# Dashboard cleanup — 2026-10-08

- Kept the Students, Imports, and Automation workflows while simplifying the professor dashboard.
- Added subject, department, and risk filters, clickable risk breakdowns, per-subject attendance recovery, and weak/falling marks reasons.
- Added subject-level department and marks thresholds to the dashboard response so filters and risk explanations use the correct subject configuration.
- Removed the duplicate appointment explainer and the unrestricted arbitrary-number demo-call endpoint; automatic voice activity remains visible through the guarded automation workflow.
- Added compact responsive styling for filters, breakdowns, risk details, and Calendar status.
- Validation: Next.js build, TypeScript check, and 20 tests passed after these changes. The first TypeScript check after route deletion used stale `.next/types`; rebuilding regenerated route types and the subsequent check passed.
- Google Calendar OAuth credentials/consent are still an operator setup step; a bare API key cannot authorize access to the professor's private calendar.
