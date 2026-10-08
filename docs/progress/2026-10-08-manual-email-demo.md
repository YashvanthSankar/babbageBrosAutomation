# 2026-10-08 — Manual demo email

- Added a professor-only dashboard control and `POST /api/email/demo-send` for sending one clearly labeled synthetic 69% attendance warning to an explicitly entered address.
- The demo endpoint performs no roster lookup, uses a 10-second provider timeout, and is limited to one send per recipient every 10 minutes and 30 sends per server hour.
- Integrated the manual control alongside the existing safe automation center. Import-triggered public-demo notifications remain simulated; live import tests remain pinned to the server-configured consenting inbox.
- Added coverage for recipient validation, normalization, provider failures, missing configuration, and timeouts.
