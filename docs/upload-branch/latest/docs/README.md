# Attendly documentation

Attendly is currently a backend-first attendance and marks ingestion/risk API. The repository includes only a minimal root page; the teacher dashboard UI is intentionally deferred.

## Reading order

1. [Product specification](product-spec.md) — intended behavior, scope, and risk rules.
2. [Architecture](architecture.md) — modules, database design, and data flow.
3. [Import contracts](import-contracts.md) — exact workbook formats and validation behavior.
4. [API reference](api-reference.md) — endpoints and request/response shapes.
5. [Development](development.md) — setup, database, tests, and deployment.
6. [AI agent guide](agent-guide.md) — invariants and handoff instructions for coding agents.

## Current status

- Implemented: Convex schema/functions, teacher-scoped student and subject CRUD, roster/attendance/marks templates and ingestion, staged atomic confirmation, correction-safe records, attendance and marks risk queries, demo session, health endpoint, and unit tests.
- Not implemented: production authentication, teacher dashboard UI, email, calls, timetable appointments, weekly summaries, and AI-generated analysis.
- Requires external configuration: a Convex deployment URL/deployment identifier, matching `CONVEX_BACKEND_SECRET` values, and a production `SESSION_SECRET`.

