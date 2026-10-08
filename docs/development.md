# Development and deployment

## Prerequisites

- Node.js 20 or newer.
- npm.
- PostgreSQL 14 or newer, reachable through a URL.

## Environment

Copy `.env.example` to `.env.local` for Next.js. Drizzle CLI commands read process environment variables, so load `DATABASE_URL` into the shell or use an environment loader supported by your host.

| Variable | Required | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | Yes | PostgreSQL connection URL |
| `SESSION_SECRET` | Production | Long random key for demo-session signing |
| `DEMO_TEACHER_EMAIL` | No | Defaults to `demo@attendly.local` |
| `DEMO_TEACHER_NAME` | No | Defaults to `Demo Faculty` |
| `MAX_UPLOAD_BYTES` | No | Defaults to 2,097,152 bytes |

Never commit `.env.local`, credentials, real roster files, or attendance files.

## Commands

```powershell
npm install
npm run db:migrate
npm run db:seed
npm run dev
```

Other commands:

- `npm test` — parser and risk tests.
- `npm run build` — production compilation.
- `npm run db:generate` — create a migration after schema changes.
- `npm run db:push` — synchronize a disposable development database without migration history.
- `npm run db:studio` — inspect the configured database.

Use `db:migrate` for shared and hosted environments. Use `db:push` only for disposable development databases.

## Verification

1. Run `npm test` and `npm run build`.
2. Start the server and call `GET /api/health`.
3. Create a cookie with `POST /api/session/demo`.
4. Create a subject.
5. Download and complete the roster template; preview and confirm it.
6. Download and complete the attendance template; preview and confirm it for the subject.
7. Fetch the dashboard and verify the risk ordering and recovery values.
8. Re-upload one changed A/P value and verify the existing record changes rather than duplicating.

## Deployment

The app requires a Node.js runtime because ExcelJS and PostgreSQL are not configured for Edge execution. It is suitable for Vercel or a conventional Node host such as Render. Configure environment variables, run migrations against the hosted database, deploy, and verify `/api/health`. Provider selection is intentionally deferred.

Serverless PostgreSQL providers should supply a pooler-compatible URL. The driver uses `prepare: false` and a small connection count to work with transaction poolers.
