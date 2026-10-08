# Attendly documentation

Attendly is currently a backend-first attendance ingestion and risk API. The repository includes only a minimal root page; the teacher dashboard UI is intentionally deferred.

## Reading order

1. [Product specification](product-spec.md) — intended behavior, scope, and risk rules.
2. [Architecture](architecture.md) — modules, database design, and data flow.
3. [Import contracts](import-contracts.md) — exact workbook formats and validation behavior.
4. [API reference](api-reference.md) — endpoints and request/response shapes.
5. [Development](development.md) — setup, database, tests, and deployment.
6. [AI agent guide](agent-guide.md) — invariants and handoff instructions for coding agents.

## Current status

- Implemented and datastore-independent: workbook templates, roster/attendance parsing, validation reports, risk calculations, API contracts, and unit tests.
- In progress: migrate persistence, teacher scoping, staged batches, atomic confirmation, CRUD, and dashboard queries to Convex.
- Not implemented: production authentication, teacher dashboard UI, marks, email, calls, timetable appointments, weekly summaries, and AI analysis.
- Requires external configuration: a Convex deployment URL/deployment identifier and a production `SESSION_SECRET`.
