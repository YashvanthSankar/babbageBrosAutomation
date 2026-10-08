# Attendly

Attendance ingestion and risk monitoring for faculty teams. The MVP imports a student roster and subject attendance workbooks, validates them before committing any records, and ranks students by attendance risk.

Start with [the documentation index](docs/README.md). AI coding agents must also read [AGENTS.md](AGENTS.md) and [the agent guide](docs/agent-guide.md).

## Quick start

```bash
npm install
copy .env.example .env.local
npm run db:push
npm run dev
```

Open `http://localhost:3000` and choose **Continue as demo teacher**.
hi
