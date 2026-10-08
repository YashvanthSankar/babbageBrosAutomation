# Deploy to the VPS

Convex production is `https://groovy-sheep-854.convex.cloud` in Denoise Labs's
`bb-automation` project. The VPS runs Next.js and provider requests.

1. Point a DNS hostname at the VPS. Open TCP ports 80 and 443.
2. Install Docker and Compose; clone the repository.
3. Create ignored `.env.production` using `.env.example`. Set
   `NEXTAUTH_URL=https://YOUR_DOMAIN`, the production Convex URL, the existing
   `CONVEX_BACKEND_SECRET`, and a generated `NEXTAUTH_SECRET`.
4. Set professor, email, voice, and optional Calendar credentials.
5. Run `APP_DOMAIN=YOUR_DOMAIN docker compose --env-file .env.production up --build -d`.
6. Check `/api/health`, sign in, add a subject, import the roster and subject
   results, then verify student access and appointments.

Calendar OAuth requires a web client with redirect URI
`https://YOUR_DOMAIN/api/auth/callback/google-professor` and professor consent.
Resend requires `RESEND_FROM_EMAIL` from an allowed sender domain.
Never store environment secrets or uploaded student files in Git.
