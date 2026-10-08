# Manual student call button

Added a professor-dashboard action for manually dispatching the existing OmniDimension attendance-risk call.

- The action appears only for subjects whose attendance is below that subject's configured threshold.
- It posts session-scoped student and subject IDs to `POST /api/voice/call`.
- Pending, dispatched, duplicate, no-longer-at-risk and provider error states are shown inline.
- Successful or duplicate actions are disabled for the current page session; the backend notification key remains the durable duplicate guard.
