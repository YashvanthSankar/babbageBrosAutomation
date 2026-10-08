# Instructions for coding agents

Read docs/README.md followed by docs/architecture.md before changing this repository.

The user explicitly requested Convex production on 2026-10-08, superseding the earlier PostgreSQL requirement. Canonical persistence is now convex/schema.ts with convex/backend.ts, convex/dashboard.ts and convex/integrations.ts. Next.js server adapters use lib/convex.ts and a server-only shared secret. Automation (provider calls, email, scheduling) executes on the VPS.

Authentication remains NextAuth in lib/auth.ts. Derive professor ownership and student identity from the session, never the request body. Preserve Gokul's Excel parsers, staged atomic confirmation, templates and tests; dashboard CSV adapters use the same pipeline. Keep docs synchronized and add dated progress notes. Never commit secrets, .env.local or uploaded student data. Historical PostgreSQL/Drizzle/JOSE originals under docs/upload-branch are reference only.
