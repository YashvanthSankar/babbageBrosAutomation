# Why a product instead of only a workflow editor

Zapier, n8n, and Make are powerful automation platforms. We did not benchmark them and do not claim a universal winner. For student success, the differentiator is the **trusted domain application around the integration**:

| Decision factor | This application | Workflow platform alone |
|---|---|---|
| Spreadsheet validation | Roster-first matching, row errors, preview, atomic one-time confirmation and repeat-import corrections | Requires custom validation and durable state alongside a visual workflow |
| Explainability | Risk, thresholds, marks movement and exact recovery arithmetic reuse the same records for faculty and students | Possible, but requires shared domain logic and consistent data contracts |
| Access boundaries | Server derives professor/student identity from a session; demo credentials are **not** identity verification | Requires a separate trusted login/UI and secure authorization for student views |
| Retry and evidence | Claims and collision checks live with Convex data; activity distinguishes simulation, provider acceptance and failure | Can be built with platform retries and an external idempotency store |
| Integrations | Server-side Resend/voice, optional Google Calendar consent, configurable scheduling | Connectors and operational tooling may be easier to configure |

This is a fit-for-purpose architecture, not proof that workflow products are inferior. Their connectors could be added later without changing the authoritative roster/risk model. **Costs of this choice:** operating Next.js on a VPS and Convex, maintaining adapters and writing tests. **Demo limitations:** open credentials sign-in can be impersonated; use synthetic records only. Public email and calls are simulated by default. Provider acceptance is not proof of delivery; Calendar consent and hosted configuration must be tested separately. Never claim unverified production delivery.
