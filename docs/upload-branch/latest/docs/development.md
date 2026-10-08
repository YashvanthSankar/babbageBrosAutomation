# Development and deployment

## Prerequisites

- Node.js 20 or newer.
- npm.
- A Convex account and development deployment.

## Environment

Convex setup produces the deployment configuration used by its CLI and client. Keep deployment identifiers and URLs in local or host-managed environment variables.

| Variable | Required | Purpose |
| --- | --- | --- |
| `CONVEX_DEPLOYMENT` | Yes for development | Convex development deployment identifier |
| `NEXT_PUBLIC_CONVEX_URL` | Yes | Convex deployment URL |
| `CONVEX_BACKEND_SECRET` | Yes | Shared server-only secret configured in Next.js and Convex |
| `SESSION_SECRET` | Production | Long random key for demo-session signing |
| `DEMO_TEACHER_EMAIL` | No | Defaults to `demo@attendly.local` |
| `DEMO_TEACHER_NAME` | No | Defaults to `Demo Faculty` |
| `MAX_UPLOAD_BYTES` | No | Defaults to 2,097,152 bytes |

Never commit `.env.local`, credentials, real roster files, or attendance files.

## Commands

The intended development flow after the Convex migration is completed is:

```powershell
npm install
npx convex dev
npm run dev
```

Other commands:

- `npm test` — parser and risk tests.
- `npm run build` — production compilation.
- `npx convex dev` — synchronize the Convex schema/functions and generate API types.
- `npx convex dashboard` — open the deployment dashboard.
- `npm run convex:deploy` — deploy Convex schema and functions.

## Verification

1. Run `npm test` and `npm run build`.
2. Start the server and call `GET /api/health`.
3. Create a cookie with `POST /api/session/demo`.
4. Create a subject.
5. Download and complete the roster template; preview and confirm it.
6. Download and complete the attendance template; preview and confirm it for the subject.
7. Download and complete the marks template; preview and confirm two assessments for the subject.
8. Fetch both dashboards and verify attendance recovery plus weak/falling marks ordering.
9. Re-upload changed attendance and marks values and verify existing records change rather than duplicate.

## Deployment

The Next.js upload handlers require a Node.js runtime because ExcelJS is not configured for Edge execution. Convex functions deploy separately through the Convex CLI. Configure both Convex variables and `SESSION_SECRET` on the selected Next.js host, deploy the Convex functions, deploy the app, and verify `/api/health`.

Before starting Next.js, configure the Convex deployment secret with `npx convex env set CONVEX_BACKEND_SECRET <value>` and place the same value in the Next.js server environment.

