# Babbage Bros — Student Success

> **From class records to the next right intervention.**
>
> An education-support workflow that turns attendance and assessment uploads into clear, explainable risk signals—and gives faculty and students a practical next step.

**CS Week · Education Track**

| Try it | Link |
|---|---|
| **Live application** | [https://automation.zapdos.me](https://automation.zapdos.me) |
| **Demo video (Google Drive folder)** | [Open the demo video folder](https://drive.google.com/drive/folders/1YsY0S6E2oenZPANP0DBc4W1Xzsvun2lo?usp=sharing) |
| Source | [GitHub repository](https://github.com/YashvanthSankar/babbageBrosAutomation) |

## The problem we chose to solve

Attendance sheets and test scores are often reviewed separately, manually, and too late. A percentage may tell a professor that a student is struggling; it does not tell them **how serious the gap is, what changed, or what to do next**. Students may not know they are approaching a requirement until recovering becomes much harder.

Student Success connects the records faculty already have to a small, actionable support loop:

**Import → detect risk → explain it → notify → make it easier to ask for help.**

The goal is not to replace a professor’s judgment. It is to make important signals visible early enough that a professor and student can act on them.

## What the product does

### For faculty

- Create a subject and set attendance and marks thresholds.
- Import the student roster first, then subject attendance and assessment results from CSV or Excel.
- Review validated import previews before applying data. Invalid rows are explained; a failed confirmation does not partially apply a batch.
- See students ordered by risk, with attendance, recovery classes, latest marks, and score movement together.
- Trigger post-import warning emails and newly-below-threshold call automation when provider credentials are configured.

### For students

- Sign in using their institute email and see **their own** subject attendance and marks—not another student’s data.
- Understand the attendance gap and how many consecutive classes would bring them back to the subject requirement.
- Review weak or falling marks and book an available professor appointment.

## How the workflow works

1. **Roster first.** The professor imports each student’s name, roll number, phone, and email. Later imports are matched to that roster; unknown roll numbers are reported rather than silently attached to the wrong person.
2. **Preview before applying.** CSV and Excel inputs are validated and staged. Faculty can see errors and a sample of the parsed data before confirming. Confirmed batches are applied atomically and cannot be confirmed twice.
3. **Calculate risk from the records.** Attendance and marks are normalized per student and subject. The dashboard puts the most urgent cases first and shows the facts behind each flag.
4. **Act after a successful import.** The server can send grounded warning emails after attendance or marks imports. When an attendance import causes a student to newly cross below the attendance threshold, it can request an automated call. Notification claims prevent duplicate dispatches for the same risk snapshot.
5. **Offer a way forward.** Students can reserve a professor appointment. Reservations are collision-checked; when the professor has connected Google Calendar, availability and event creation can use that calendar.

Provider calls happen on the server **after** the data is safely committed. A failed email or call is recorded as an integration failure; it does not undo the professor’s valid import. Opening or refreshing a dashboard does not itself trigger calls or emails.

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

## Why we built an application instead of a Zapier/n8n flow

Zapier and n8n are useful tools, and they are excellent for connecting existing services. This problem also needs a **trusted product around the automation**:

- **The data has to be right before action is taken.** Roster matching, date-column attendance sheets, marks validation, preview, correction, and atomic confirmation are domain rules—not just steps between two APIs.
- **The calculation must be inspectable.** The same subject-level records power the risk table, recovery count, student view, and notification facts. There is one calculation to audit instead of separate copies hidden in workflow nodes.
- **The user’s identity controls the data.** Faculty operations are separated from student views; student requests resolve to the signed-in roster record on the server.
- **Automation must be safe to retry.** Imports, notification claims, and bookings have explicit uniqueness or collision checks, so retries are not treated as new evidence or a new appointment.
- **People need a usable interface.** A professor previews a sheet and sees why a row is rejected; a student sees a personal explanation and a next step. Neither audience should have to inspect an automation editor.

We chose application code for the rules, permissions, and student/faculty experience, while using dedicated services where they fit: Convex for shared persistence, Resend for email delivery, OmniDimension for voice, and Google Calendar when professor authorization is configured. This keeps the critical decisions close to the data and makes each step testable.

## What is implemented—and what still needs provider setup

We want the demo to be credible, so we distinguish working application behavior from an external integration that still needs credentials or a verified sender.

| Capability | Implementation / verification |
|---|---|
| Roster, attendance, and marks imports | CSV and Excel parsing, validation, staged previews, atomic confirmation, templates, and repeat-import handling are implemented. |
| Attendance and marks risk | Deterministic threshold, recovery-class, weak-mark, and falling-mark calculations are implemented and covered by tests. |
| Professor/student dashboards | Implemented with server-side role and student-record scoping. |
| Appointment booking | In-app reservations and collision rejection were tested. Google Calendar synchronization is optional and requires professor OAuth consent; do not assume it is connected in a demo. |
| Voice | Newly-below-threshold trigger and notification deduplication are implemented. One controlled OmniDimension call returned success. That verifies the provider path, **not a complete judge-observed upload-to-call demonstration**. |
| Email | Risk-based Resend dispatch is implemented. A test send was rejected because the sender domain was not verified/allowed; successful student delivery is not claimed until that is configured. |
| Weekly summary | Not implemented in this competition version. |
| Public demo hosting | [https://automation.zapdos.me](https://automation.zapdos.me) · Public reachability was not verified from the audit environment. |

## A judge’s two-minute walkthrough

1. Open the live demo and sign in as the configured professor.
2. Create a subject, import the sample roster, then import attendance and marks.
3. Open the risk-ranked student list. Pick a student below threshold and inspect the attendance arithmetic, recovery count, and marks trend.
4. Sign out and sign in with that roster-listed student’s institute email. Confirm that only their records appear.
5. Book an appointment and show the result. If Google Calendar is not connected, describe it accurately as an in-app reservation—not a Google event.
6. If demonstrating a voice call, use only the approved test recipient and show the actual provider result. Do not imply an email was delivered unless it was received.

Use synthetic records for judging. The competition login accepts any **non-empty demo password**; it does not verify passwords and is not production-grade authentication. The student email must be on the professor’s roster. Do not load real student contact data into this demo.

## Data formats

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

## How it is built

- **Next.js + TypeScript** — professor and student web experience and server-side API routes.
- **Convex** — canonical production persistence and atomic mutations for imports, risk data, bookings, and notification records.
- **ExcelJS + CSV parsers** — spreadsheet ingestion and validation.
- **VPS** — hosts the web application and executes provider requests after imports.
- **Resend, OmniDimension, Google Calendar** — external integrations, each used only when its server credentials and required account permissions are configured.

The professor is identified by the exact configured `PROFESSOR_EMAIL`. Student views resolve from the signed-in email and roster, not an ID supplied by the browser. Raw phone numbers are not returned in student dashboard responses. See [the architecture](docs/architecture.md) and [VPS deployment guide](deploy/README.md).

## Run and verify

```bash
npm ci
cp .env.example .env.local
# Configure the required Convex, session, and professor variables in .env.local.
npm run dev
```

Provider secrets belong only in the server environment and must never be committed. Run checks with:

```bash
npm test
npm run typecheck
npm run build
```

For VPS deployment, HTTPS, and provider configuration, follow [deploy/README.md](deploy/README.md). Production Convex functions are deployed separately from the Next.js server; a new VPS instance needs the matching server-only Convex secret.

---

**Babbage Bros** · Built for CS Week · Education Track
