# Manual demo deployment · 2026-10-09

Deployment target: https://automation.zapdos.me, Oracle VPS project `/home/ubuntu/babbagebros-automation`, PM2 `babbagebros-automation`, loopback port 3103. The existing `/etc/caddy/Caddyfile` route is unchanged. Versioned standalone releases use the `current` symlink; `previous` retains the rollback release. Production secrets remain exclusively in `shared/.env.production`, never copied into Git or the release archive.

Convex production `groovy-sheep-854` was deployed successfully before the VPS release, ensuring the existing atomic ten-attempt manual counters and legacy migration safeguards are present. Provider configuration on the VPS was checked for presence only; no secrets were printed or changed. The local provider dispatch tests are mocked. No real call or email is authorized by this deployment smoke check.

The versioned PM2 ecosystem mirrors the verified existing VPS settings, including its Node runtime. To roll back, repoint `current` to the retained previous release, reload only `babbagebros-automation` using the ecosystem, verify its health and run `pm2 save`. Do not reload unrelated applications or change Caddy/DNS for this update.

Release verification results will be added after rollout. Authenticated delivery and provider receipt/call completion remain separate from deployment verification.
