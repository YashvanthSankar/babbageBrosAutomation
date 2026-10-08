# Attendly Backend

TypeScript API for validating student and attendance workbooks, storing normalized attendance, and ranking students by attendance risk.

The current deliverable is intentionally backend-first. Start with [the documentation index](docs/README.md). AI coding agents must also read [AGENTS.md](AGENTS.md) and [the agent guide](docs/agent-guide.md).

## Quick start

```powershell
npm install
Copy-Item .env.example .env.local
npm run db:migrate
npm run db:seed
npm run dev
```

Call `GET http://localhost:3000/api/health`, then use `POST /api/session/demo` to obtain the demo session cookie. Full request examples are in [docs/api-reference.md](docs/api-reference.md).
