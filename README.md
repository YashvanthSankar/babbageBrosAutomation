# Attendly Backend

TypeScript API for validating student, attendance, and marks workbooks, storing normalized records in Convex, and ranking students by attendance and academic risk.

The current deliverable is intentionally backend-first. Start with [the documentation index](docs/README.md). AI coding agents must also read [AGENTS.md](AGENTS.md) and [the agent guide](docs/agent-guide.md).

## Quick start

```powershell
npm install
npx convex dev
npm run dev
```

Set the same `CONVEX_BACKEND_SECRET` in the local Next.js environment and the Convex deployment. Then call `POST /api/session/demo` to obtain the demo cookie. See [docs/development.md](docs/development.md) for the complete setup.
