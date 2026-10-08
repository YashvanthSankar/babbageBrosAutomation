# Attendly Backend

TypeScript API for validating student and attendance workbooks, storing normalized attendance in Convex, and ranking students by attendance risk.

The current deliverable is intentionally backend-first. Start with [the documentation index](docs/README.md). AI coding agents must also read [AGENTS.md](AGENTS.md) and [the agent guide](docs/agent-guide.md).

## Important status

Convex is the required datastore. The current persistence adapter still needs to be migrated to Convex before the backend is runnable; this is recorded explicitly in the collaborator documentation. Do not deploy until that migration and its smoke tests are complete.
