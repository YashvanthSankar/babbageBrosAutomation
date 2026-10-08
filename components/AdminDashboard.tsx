"use client";

import { useMemo, useState } from "react";
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
import { Alert, Badge, Card, CardHeader, EmptyState, Progress, Stat } from "./ui";
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
          title="Appointment scheduling"
          subtitle="Students can request subject-specific advising appointments from available slots."
          actions={<Badge tone="accent">Availability managed in app</Badge>}
        />
        <div className="card-body stack" style={{ gap: 12 }}>
          <Alert tone="info" title="Student appointments">
            Students select a subject, date, and open appointment slot. The service checks slot
            availability again when the booking is confirmed, preventing duplicate reservations.
          </Alert>
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
