# Babbage Bros / Student Success

> **From class records to the next right intervention.**
>
> A roster-aware student support system: turn messy attendance and assessment sheets into explainable risk, visible follow-up, and a path to a consultation.

**CS Week · Education Track · Competition demo using synthetic student records**

| Try it | Link |
|---|---|
| **Live application** | [https://automation.zapdos.me](https://automation.zapdos.me) |
| **Watch on Google Drive** | [Play the demo video](https://drive.google.com/file/d/19jopIIb_om1eBuyqnCYHLwsilI91GU4B/view?usp=sharing) |
| **Direct MP4 file** | [Download the video from GitHub](https://raw.githubusercontent.com/YashvanthSankar/babbageBrosAutomation/main/media/student-success-demo.mp4) |
| Other video links | [GitHub video page](https://github.com/YashvanthSankar/babbageBrosAutomation/blob/main/media/student-success-demo.mp4) · [Google Drive folder](https://drive.google.com/drive/folders/1YsY0S6E2oenZPANP0DBc4W1Xzsvun2lo?usp=sharing) |
| Source | [GitHub repository](https://github.com/YashvanthSankar/babbageBrosAutomation) |

[![Watch the Student Success demo video: records to risk to support](media/student-success-demo-poster.jpg)](https://github.com/YashvanthSankar/babbageBrosAutomation/blob/main/media/student-success-demo.mp4)

**[▶ Play on Google Drive](https://drive.google.com/file/d/19jopIIb_om1eBuyqnCYHLwsilI91GU4B/view?usp=sharing)** · **[↓ Direct MP4 download](https://raw.githubusercontent.com/YashvanthSankar/babbageBrosAutomation/main/media/student-success-demo.mp4)**. This 1080p, 1-minute-32-second narrated tour uses a real capture of the public landing page and the real dashboard interface with **synthetic, intercepted data**—not live student records or a completed provider send. Hosted weekly execution and Google Calendar remain unverified end to end. See [the verification audit](docs/progress/2026-10-09-integration-audit.md).

## The problem we chose to solve

Attendance sheets and test scores are often reviewed separately, manually, and too late. A percentage may tell a professor that a student is struggling; it does not tell them **how serious the gap is, what changed, or what to do next**. Students may not know they are approaching a requirement until recovering becomes much harder.

Student Success connects the records faculty already have to a small, actionable support loop:

**Validate → commit → calculate → explain → record an intervention → book help.**

The interesting part is not calling an email API. It is deciding **which record belongs to whom, whether a correction changed the signal, whether an action has already been attempted, and whether the result is actually delivered**. Those decisions require a durable domain model. The goal is not to replace faculty judgment; it is to surface evidence early enough for faculty and students to act.

## What the product does

### For faculty

- Create a subject and set attendance and marks thresholds.
- Import the roster first, then attendance and marks. Dashboard imports return row-level validation errors before applying records; the server also exposes staged preview/confirm APIs.
- Upload CSV for each record type; roster, attendance, and marks also accept Excel. Excel marks require a test name, date, and maximum score.
- See students ordered by risk, with attendance, recovery classes, latest marks, and score movement together.
- Review deduplicated post-import email/call activity; public mode is simulated, while optional live tests are pinned to consenting test contacts.
- Run an ISO-week-deduplicated cohort digest and conditional adviser escalation manually; optionally schedule it with authenticated VPS cron. The activity feed records aggregate counts and action status, **not confirmed inbox delivery**.

### For students

- Sign in using their institute email and see **their own** subject attendance and marks—not another student’s data.
- Understand the attendance gap and how many consecutive classes would bring them back to the subject requirement.
- Review weak or falling marks and book an available professor appointment.

## How the workflow works

1. **Roster first.** The professor imports each student’s name, roll number, phone, and email. Later imports are matched to that roster; unknown roll numbers are reported rather than silently attached to the wrong person.
2. **Validate before applying.** Dashboard uploads show row-level errors and do not apply invalid batches. Dedicated preview/confirm endpoints are also available for staged import clients; confirmed batches are atomic and cannot be confirmed twice.
3. **Calculate risk from the records.** Attendance and marks are normalized per student and subject. The dashboard puts the most urgent cases first and shows the facts behind each flag.
4. **Act after a successful import.** Imports create visible notification activity. In public demo mode, email and call outcomes are honestly marked simulated. Voice activity requires a newly-below-threshold attendance transition; risk email activity is deduplicated by a snapshot of the current risk. With explicit VPS opt-in, a test email/call goes only to a consenting, server-pinned test recipient and uses fixed synthetic content—never uploaded student contact or academic data.
5. **Offer a way forward.** Students can reserve a professor appointment. Convex rejects overlapping local reservations; with professor OAuth consent the app checks Google FreeBusy and creates an event on the connected account's primary calendar. This is not a distributed transaction with Google; an external change between the check and event creation can still race.

Provider calls happen on the server **after** the data is safely committed. A failed email or call is recorded as an integration failure; it does not undo the professor’s valid import. Opening or refreshing a dashboard does not itself trigger calls or emails. Live demo messages/calls go only to server-pinned test contacts with fixed synthetic content; they are not personal messages to uploaded students. An event marked `simulated` was not sent; `dispatched` means the provider accepted the request, not that a person received it. An uncertain or failed send consumes its claim rather than risking a duplicate retry.

## Explainable risk, not a black box

High-stakes attendance arithmetic should be auditable. We do not ask a language model to guess a student’s risk or invent a recovery count. The percentage and recovery plan are calculated directly from the imported records.

For attendance threshold `t`, attended classes `p`, and recorded classes `n`:

```text
attendance percentage = 100 × p / n
recovery classes      = max(0, ceil((t × n - p) / (1 - t)))
```

Here `t` is the threshold as a fraction—for example, `0.85` for 85%. The recovery count is the smallest number of consecutive attended classes that reaches the threshold.

**Example:** 16 attended out of 20 is 80%. At an 85% threshold, the student needs **7 consecutive attended classes**: `(16 + 7) / (20 + 7) = 85.2%`.

Marks are compared as percentages, so results with different maximum scores can be compared. A result below the configured marks threshold is flagged as weak; a drop of at least 10 percentage points from the previous result is flagged as falling. The dashboard shows those inputs so faculty can judge the context.

## The architecture: one source of truth, explicit side effects

```text
Faculty CSV/XLSX ──> Next.js import adapter ──> validated preview / one-shot upload
                          │                              │
                          │                         Convex transaction
                          │                   roster · subjects · class dates · scores
                          │                              │
Student / faculty UI <── session-scoped API <── risk projections + cohort counts
                                                        │
                                after successful import ─┴─> durable action claim
                                                        │
                                   simulate by default / optional pinned test
                                          Resend · OmniDimension

Student booking ──> Next.js session + subject checks ──> Convex overlap reservation
                     └─ optional professor OAuth: Google FreeBusy + event creation

VPS scheduler (optional) ──> secret-gated weekly endpoint ──> aggregate claim
```

**Trust boundaries, not a list of logos:** The browser supplies files, subject choices, and booking times, but never a teacher owner, outbound email address, or call destination. NextAuth supplies the session email; Next.js derives the professor and student record and keeps the Convex backend secret and provider keys server-side. Convex is canonical persistence; its functions check the shared secret, and transactions enforce one-time import confirmation, claim uniqueness and booking overlap. Provider HTTP calls run on the VPS, not inside a database mutation. Google OAuth is a separate consent flow; the configured Calendar account is mapped to the application professor after Google verifies the account. For the public demo, session scoping does **not** establish identity because the password is not verified.

**What is stored:** normalized roster identities and subjects; attendance keyed by student, subject and class date; assessments and percentage-normalized marks; expiring staged batches; bookings; encrypted Calendar refresh tokens; notification and aggregate action states. Original upload files are not stored. An import is all-or-nothing inside one Convex confirmation mutation. Re-importing the same class date or assessment corrects existing records instead of adding fictitious extra classes or tests. The dashboard's direct upload API parses and validates before staging/confirming in the same backend; the separate preview API lets a client inspect row errors before committing. Dashboard risk projections and Convex automation/cohort projections are separate implementations over the same records; tested scenarios agree, but exhaustive parity across edge cases has not been established. See [architecture](docs/architecture.md), [import contracts](docs/import-contracts.md), and [API reference](docs/api-reference.md).

**The stack and why each piece exists**

| Layer | Choice | Responsibility / tradeoff |
|---|---|---|
| Experience and API | Next.js 14, React 18, TypeScript, NextAuth 4 on a VPS | Faculty and student interfaces, session-scoped API, server-only integrations; we operate the web deployment ourselves. |
| Durable domain state | Convex | Indexed roster/subject/record tables, atomic import confirmations, at-most-once action claims, collision-checked local booking. Deployed separately from the VPS, so versions must match. |
| Ingestion | ExcelJS and CSV parsers | Real date columns, row errors, roster matching, strict marks checks and upload caps. Excel and CSV share the confirmation path. |
| Rules and evidence | TypeScript risk calculations + Convex cohort queries | Transparent recovery arithmetic, normalized marks, distinct at-risk counts; deterministic rules instead of an unreviewable AI classification. |
| External edges | Resend, OmniDimension, Google Calendar | Optional email, voice and calendar operations. Safe default is simulation; live calls/messages require consenting pinned destinations. Calendar writes require the account holder's OAuth consent. |
| Operations | Docker Compose, Caddy, VPS; optional system cron | HTTPS and app runtime. The weekly endpoint implements a job, **not** a scheduler; operations must install and monitor cron. |

### Why not just Zapier, n8n, or Make?

They are strong orchestration tools; they could trigger downstream notifications from **this** app. We did not measure them against this implementation and do not claim a universal speed, cost or reliability win. The design question was narrower: *what must remain authoritative when a spreadsheet is corrected, a student opens a private view, or two bookings race?*

| Requirement | Here | If built only as a workflow |
|---|---|---|
| Validate before intervention | Parse against the owned roster; show row-level errors; reject the entire invalid batch | Add custom validation and a durable roster/transaction layer before connector steps |
| Correct records safely | Upsert by student/subject/date or assessment; one-time atomic confirmation | Define record keys, correction semantics and persistence outside the visual graph |
| Explain the result | Use the same stored facts for risk, recovery math and the student/faculty views; cross-implementation parity remains a test target | Keep calculations and UI projections consistent across workflow steps and other services |
| Constrain side effects | Claim once in Convex; record `simulated`, `pending`, `dispatched`, `failed`; pin live test recipients | Configure idempotency and an audit store; connector retries alone cannot decide academic intent |
| Let a student act | Scope the view to a session and reserve a non-overlapping appointment | Add an application with authentication, views and collision-safe scheduling |

This is **not** “we replaced all connectors.” We implemented the domain-specific core as a product and kept external APIs at the edges. If an institute already has a trusted SIS and strong login, a workflow platform could be an excellent complementary orchestration layer. Our choice costs us more code, deployment work, monitoring, provider maintenance and security responsibility. The [decision record](docs/workflow-choice.md) separates fit from unsupported superiority claims.

**The difference:** a connector can send a warning; the product must first establish whose record changed, whether the risk is real, whether an intervention has already been attempted, and whether the student has a safe next step.

## Evidence and release status (9 October 2026)

**Implementation is not the same as hosted end-to-end verification.** At the [isolated integration audit](docs/progress/2026-10-09-integration-audit.md), 54 automated tests passed, including three tests executing actual Convex handlers with a disposable in-memory database; TypeScript checking and the production build also passed. At the latest read-only hosted smoke check (9 October 2026), the weekly manual route returned **401 without a session** instead of the earlier 404, so the route exists on the VPS. The cron route returned **503 without configuration**; authenticated weekly execution, an installed schedule, and provider delivery remain unverified. The smoke script never signs in, uploads data, sends mail or places calls.

| Capability | Implementation / verification |
|---|---|
| Roster, attendance, and marks imports | CSV and Excel adapters, validation, templates, corrections, and staged one-time atomic confirmation implemented; isolated Convex transaction flow verified. Authenticated hosted uploads **not** re-tested for this release. |
| Attendance and marks risk | Deterministic threshold, recovery-class, weak-mark, and falling-mark calculations covered by unit and isolated cross-function tests. |
| Professor/student dashboards | Implemented with server-side session scoping; anonymous hosted dashboard request returns 401. Authenticated hosted student isolation not re-tested; demo passwords do not establish identity. |
| Appointment booking | Local Convex conflict and cross-professor checks passed in isolated tests. Google Calendar consent, availability and real event creation are **not verified end to end**. |
| Voice | A newly-below-threshold attendance transition creates a deduplicated event. Public mode simulates; explicitly enabled live tests use only the server-pinned test number and fixed synthetic context. |
| Email | Attendance/marks imports create deduplicated warning activity. A manual synthetic warning demo is limited to once per UTC day with a durable claim; public mode simulates. Explicitly enabled live tests go only to the server-pinned consenting inbox with fixed synthetic content. Live inbox receipt has not been verified. |
| Weekly summary and adviser escalation | Implemented and tested locally; isolated Convex test verifies cohort counts and duplicate weekly claims. The hosted manual route now returns **401 without a session**, not 404; the cron route returns **503** because its required configuration is missing. Neither route has been verified with an authorized run. Scheduling requires `CRON_SECRET` and a monitored VPS cron entry; neither is proved installed. Adviser action requires a configured adviser email and at-risk students. Public mode simulates; optional live test delivery is pinned to a consenting test inbox. |
| Public demo hosting | [https://automation.zapdos.me](https://automation.zapdos.me) · Home and health return 200; protected reads return 401 without a session. Route presence is not evidence that authenticated workflows succeed. |

## A judge’s two-minute walkthrough

1. Open the live demo and sign in as the configured professor.
2. Create a subject, import the sample roster, then import attendance and marks.
3. Open the risk-ranked student list. Pick a student below threshold and inspect the attendance arithmetic, recovery count, and marks trend.
4. Sign out and sign in with that roster-listed student’s institute email. Confirm that only their records appear.
5. Book an appointment and show the result. If Google Calendar is not connected, describe it accurately as an in-app reservation—not a Google event.
6. After checking the VPS configuration with synthetic data, open Automations, run the weekly summary, repeat it to inspect the `already_run` result, and verify aggregate counts. The hosted route exists but **this authenticated path has not been checked**. Public mode marks events simulated; a provider-accepted pinned test does not prove an email was read or a call answered.

**Demo security:** sign-in accepts any non-empty password and does not verify identity. Anyone can impersonate the configured professor or a student account. This is not production authentication or a secure store for real records. Use synthetic student names, emails, phone numbers, attendance, and marks only. Rotate the previously exposed Google OAuth client secret before real use; don't put replacement secrets in issues, chat, or Git. Dependency audit and production authentication hardening remain release work.

## Sample imports

Import the roster before subject records.

**Roster CSV**

```csv
studentname,rollno,phone,email
Asha Rao,CS001,+919876543210,asha@iiitdm.ac.in
```

**Attendance CSV** — select the subject in the dashboard; date columns are individual class meetings. Accepted values include `P/A`, `present/absent`, and `1/0`; blank means not recorded.

```csv
rollno,2026-10-01,2026-10-03,2026-10-05
CS001,P,A,P
```

**Marks CSV**

```csv
rollno,subject,test_name,test_date,score,max_score
CS001,CS101,Quiz 1,2026-10-01,7,10
```

Downloadable Excel templates are available at `/api/templates/roster`, `/api/templates/attendance`, and `/api/templates/marks`. Import details and validation rules are in [the import contract](docs/import-contracts.md).

The professor role is determined by the exact configured `PROFESSOR_EMAIL`; student records are looked up using the signed-in email, not an ID supplied by the browser. Because demo passwords are not verified, this is session scoping—not proof of identity. Raw phone numbers are not returned in student dashboard responses. See [the architecture](docs/architecture.md) and [VPS deployment guide](deploy/README.md).

## Run and verify

```bash
npm ci
cp .env.example .env.local
# Configure the required Convex, session, and professor variables in .env.local.
npm run dev
# Dedicated preview on http://localhost:3001 (isolated build cache):
npm run dev:preview
```

Provider secrets belong only in the server environment and must never be committed. Run checks with:

```bash
npm test
npm run typecheck
npm run build
npm run smoke:hosted # read-only anonymous checks; passing does not verify integration delivery
```

The isolated Convex tests use `convex-test`: useful for business logic, but not a real Convex deployment, server session, provider inbox or Google consent test. The smoke script makes no authenticated requests and does not dispatch providers. For HTTPS, deployment and provider configuration, follow [deploy/README.md](deploy/README.md); production Convex functions and VPS Next.js releases are separate. To finish hosted verification: confirm the running VPS revision and environment, sign in with synthetic identities, exercise roster → attendance → marks → risk → student view → booking in a controlled demo environment, manually run and replay the weekly summary, and verify cron and OAuth only after explicitly configuring them. Do not enable live providers without consenting, pinned recipients.

---

**Babbage Bros** · Built for CS Week · Education Track
