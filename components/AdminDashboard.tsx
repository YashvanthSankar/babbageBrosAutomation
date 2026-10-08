"use client";

import { useMemo, useState } from "react";
import { signIn, useSession } from "next-auth/react";
import type { AdminDashboard as AdminData, Student, SubjectStat } from "./types";
import {
  attendancePercent,
  formatPercent,
  isSubjectAtRisk,
  riskStatTone,
  studentRiskBadge,
  subjectLabel,
  summarize,
  uniqueSubjects,
} from "./helpers";
import { Alert, Badge, Card, CardHeader, EmptyState, Progress, Spinner, Stat } from "./ui";
import UploadsPanel from "./UploadsPanel";

type Tab = "students" | "imports";

export default function AdminDashboard({
  data,
  onChanged,
}: {
  data: AdminData;
  onChanged: () => void;
}) {
  const [tab, setTab] = useState<Tab>("students");
  const [query, setQuery] = useState("");

  // Calendar status comes from the server session, not from local state.
  const { data: session } = useSession();
  const hasCalendar = Boolean(session?.user?.hasCalendar);
  const [connectingCalendar, setConnectingCalendar] = useState(false);

  async function connectCalendar() {
    setConnectingCalendar(true);
    try {
      // Full-page OAuth redirect. Calendar consent is professor-only and can
      // never be granted (or faked) from this client.
      await signIn("google-professor");
    } catch {
      setConnectingCalendar(false);
    }
  }

  const students = data.students ?? [];
  const summary = useMemo(() => summarize(students), [students]);
  const subjects = useMemo(() => uniqueSubjects(students), [students]);

  // Prefer server-provided stats when present; fall back to values computed
  // from the live roster (never fabricated).
  const backendStats = data.stats ?? {};
  const statStudents =
    typeof backendStats.students === "number" ? backendStats.students : summary.students;
  const statSubjects =
    typeof backendStats.subjects === "number" ? backendStats.subjects : summary.subjects;
  const statAtRisk =
    typeof backendStats.atRisk === "number" ? backendStats.atRisk : summary.atRisk;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return students;
    return students.filter((s) =>
      [s.name, s.rollNo, s.email, s.department]
        .filter(Boolean)
        .some((field) => String(field).toLowerCase().includes(q)),
    );
  }, [students, query]);

  const professorLabel = data.professor?.name || data.professor?.email || "Professor";

  return (
    <div className="stack" style={{ gap: 24 }}>
      <div className="page-head">
        <div className="row-between">
          <div>
            <h1>Professor dashboard</h1>
            <p>
              Signed in as <strong>{professorLabel}</strong>. Manage the roster, imports, and
              attendance risk.
            </p>
          </div>
          <div className="tabs" role="tablist" aria-label="Dashboard sections">
            <button
              className={`tab ${tab === "students" ? "active" : ""}`}
              onClick={() => setTab("students")}
              role="tab"
              aria-selected={tab === "students"}
              type="button"
            >
              Students &amp; risk
            </button>
            <button
              className={`tab ${tab === "imports" ? "active" : ""}`}
              onClick={() => setTab("imports")}
              role="tab"
              aria-selected={tab === "imports"}
              type="button"
            >
              Imports
            </button>
          </div>
        </div>
      </div>

      {summary.students === 0 && tab === "students" ? (
        <Alert tone="info" title="No students yet">
          Import the roster first in the <strong>Imports</strong> tab. Attendance and marks uploads
          are rejected until roster rows exist.
          <div className="row" style={{ marginTop: 12 }}>
            <button className="btn btn-primary btn-sm" onClick={() => setTab("imports")} type="button">
              Go to imports
            </button>
          </div>
        </Alert>
      ) : null}

      <div className="stat-grid">
        <Stat label="Students" value={statStudents} hint="Rows in the professor roster" />
        <Stat
          label="At risk"
          value={statAtRisk}
          tone={statAtRisk > 0 ? "danger" : "ok"}
          hint="Below 85% attendance or flagged to watch"
        />
        <Stat label="Subjects" value={statSubjects} hint="Subjects owned by the professor" />
        <Stat
          label="Avg attendance"
          value={formatPercent(summary.avgAttendance)}
          tone={riskStatTone(summary.avgAttendance)}
          hint="Computed from imported attendance"
        />
      </div>

      <Card padded={false}>
        <CardHeader
          title="Google Calendar"
          subtitle="Advising availability is read from your Google Calendar. Calendar access is a professor-only consent."
          actions={
            <Badge tone={hasCalendar ? "ok" : "warn"}>
              <span className="dot" aria-hidden />
              {hasCalendar ? "Connected" : "Not connected"}
            </Badge>
          }
        />
        <div className="card-body stack" style={{ gap: 12 }}>
          {hasCalendar ? (
            <Alert tone="ok" title="Google Calendar connected">
              Availability and bookings reflect your live Google Calendar. Students only ever see
              the free slots derived from it.
            </Alert>
          ) : (
            <>
              <Alert tone="warn" title="Google Calendar not connected">
                Students cannot book real advising slots until you connect your Google Calendar.
                This needs a separate Google OAuth consent because Calendar access is only ever
                granted by you, the professor — students are never asked for it. Until then, booking
                stays honest and reports local-only availability.
              </Alert>
              <div className="row wrap">
                <button
                  className="btn btn-primary"
                  onClick={connectCalendar}
                  disabled={connectingCalendar}
                  type="button"
                >
                  {connectingCalendar ? <Spinner /> : <GoogleGlyph />}
                  {connectingCalendar ? "Opening Google…" : "Connect Google Calendar"}
                </button>
                <span className="small muted">
                  You will be asked to grant Calendar free/busy and events access.
                </span>
              </div>
            </>
          )}
        </div>
      </Card>

      {tab === "students" ? (
        <Card padded={false}>
          <CardHeader
            title="Roster & risk"
            subtitle={`${filtered.length} of ${students.length} students`}
            actions={
              <div className="search-box">
                <label className="sr-only" htmlFor="student-search">
                  Search students
                </label>
                <input
                  id="student-search"
                  className="input"
                  placeholder="Search name, roll no, email…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </div>
            }
          />
          {students.length === 0 ? (
            <EmptyState icon="👥" title="No students in the roster">
              Upload the roster CSV to populate this table.
            </EmptyState>
          ) : filtered.length === 0 ? (
            <EmptyState icon="🔍" title="No matches">
              No student matches “{query}”.
            </EmptyState>
          ) : (
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Roll no</th>
                    <th>Student</th>
                    <th>Department</th>
                    <th>Subjects &amp; attendance</th>
                    <th>Overall</th>
                    <th>Risk</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((student) => (
                    <StudentRow key={String(student.id)} student={student} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      ) : (
        <UploadsPanel subjects={subjects} studentsCount={students.length} onImported={onChanged} />
      )}
    </div>
  );
}

function StudentRow({ student }: { student: Student }) {
  const overall = overallAttendance(student.subjects ?? []);
  const risk = studentRiskBadge(student);
  return (
    <tr>
      <td className="mono">{student.rollNo ?? "—"}</td>
      <td>
        <div className="cell-strong">{student.name ?? "Unnamed"}</div>
        <div className="small muted">{student.email ?? "—"}</div>
      </td>
      <td>{student.department ?? "—"}</td>
      <td>
        {student.subjects && student.subjects.length > 0 ? (
          <div className="chips">
            {student.subjects.map((subject) => {
              const pct = attendancePercent(subject);
              const tone = isSubjectAtRisk(subject) ? "danger" : "ok";
              return (
                <span
                  key={String(subject.id)}
                  className={`badge ${tone === "danger" ? "badge-danger" : "badge-ok"}`}
                  title={`${subjectLabel(subject)} · ${formatPercent(pct)}`}
                >
                  {subject.code || subject.name || `#${subject.id}`} · {formatPercent(pct)}
                </span>
              );
            })}
          </div>
        ) : (
          <span className="muted small">No subject data</span>
        )}
      </td>
      <td style={{ minWidth: 130 }}>
        {overall === null ? (
          <span className="muted">—</span>
        ) : (
          <div className="progress-row">
            <Progress percent={overall} />
            <span className="small mono">{formatPercent(overall)}</span>
          </div>
        )}
      </td>
      <td>
        <Badge tone={risk.tone}>
          <span className="dot" aria-hidden />
          {risk.label}
        </Badge>
      </td>
    </tr>
  );
}

function overallAttendance(subjects: SubjectStat[]): number | null {
  let attended = 0;
  let total = 0;
  for (const subject of subjects) {
    if (typeof subject.attended === "number") attended += subject.attended;
    if (typeof subject.total === "number") total += subject.total;
  }
  if (total > 0) return (attended / total) * 100;
  const percents = subjects
    .map(attendancePercent)
    .filter((value): value is number => value !== null);
  if (percents.length === 0) return null;
  return percents.reduce((a, b) => a + b, 0) / percents.length;
}

function GoogleGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden focusable="false">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.9 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z"
      />
    </svg>
  );
}
