"use client";

import { useEffect, useMemo, useState } from "react";
import { signIn, useSession } from 'next-auth/react';
import { apiGet, apiPostJson } from "./api";
import type { AdminDashboard as AdminData, Student, SubjectStat } from "./types";
import {
  attendancePercent,
  formatPercent,
  riskStatTone,
  studentRiskBadge,
  subjectLabel,
  summarize,
  uniqueSubjects,
} from "./helpers";
import { Alert, Badge, Card, CardHeader, EmptyState, Progress, Stat } from "./ui";
import UploadsPanel from "./UploadsPanel";
import AutomationCenter from "./AutomationCenter";

type Tab = "students" | "imports" | "automation";

export default function AdminDashboard({
  data,
  onChanged,
}: {
  data: AdminData;
  onChanged: () => void;
}) {
  const {data:session}=useSession();
  const [tab, setTab] = useState<Tab>("students");
  const [query, setQuery] = useState("");
  const [subjectFilter, setSubjectFilter] = useState("all");
  const [departmentFilter, setDepartmentFilter] = useState("all");
  const [riskFilter, setRiskFilter] = useState("all");
  const [ownedSubjects, setOwnedSubjects] = useState<SubjectStat[]>([]);
  const [subjectName, setSubjectName] = useState("");
  const [subjectCode, setSubjectCode] = useState("");
  const [department, setDepartment] = useState("");
  const [subjectError, setSubjectError] = useState<string | null>(null);
  const [savingSubject, setSavingSubject] = useState(false);
  useEffect(() => {
    apiGet<{ subjects: SubjectStat[] }>("/api/subjects").then((result) => {
      if (result.ok) setOwnedSubjects(result.data?.subjects ?? []);
    });
  }, [data]);
  async function addSubject(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSavingSubject(true);
    setSubjectError(null);
    const result = await apiPostJson<SubjectStat>("/api/subjects", {
      name: subjectName.trim(), code: subjectCode.trim(), department: department.trim(), threshold: 85, marksThreshold: 50,
    });
    setSavingSubject(false);
    if (!result.ok || !result.data) { setSubjectError(result.error ?? "Could not add subject."); return; }
    setOwnedSubjects((previous) => [...previous, result.data!]);
    setSubjectName(""); setSubjectCode(""); setDepartment("");
    onChanged();
  }

  const students = data.students ?? [];
  const summary = useMemo(() => summarize(students), [students]);
  const subjects = useMemo(() => ownedSubjects.length ? ownedSubjects : uniqueSubjects(students), [students, ownedSubjects]);

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
    return students.filter((student) => {
      const rows = student.subjects ?? [];
      const subjectScopeMatches = rows.some((subject) =>
        (subjectFilter === "all" || String(subject.id) === subjectFilter) &&
        (departmentFilter === "all" || subject.department === departmentFilter),
      );
      const hasSubjectScope = subjectFilter !== "all" || departmentFilter !== "all";
      const searchMatches = !q || [student.name, student.rollNo, student.email, ...rows.flatMap((subject) => [subject.name, subject.code, subject.department])]
        .filter(Boolean)
        .some((field) => String(field).toLowerCase().includes(q));
      return searchMatches && (!hasSubjectScope || subjectScopeMatches) &&
        (riskFilter === "all" || String(student.riskLevel ?? "unknown").toLowerCase() === riskFilter);
    });
  }, [students, query, departmentFilter, riskFilter, subjectFilter]);

  const departments = useMemo(
    () => Array.from(new Set(subjects.map((subject) => subject.department).filter((value): value is string => Boolean(value)))).sort(),
    [subjects],
  );
  const subjectRiskCounts = useMemo(() => subjects.map((subject) => {
    const matching = students.filter((student) => (student.subjects ?? []).some((item) => String(item.id) === String(subject.id)));
    return { subject, total: matching.length, atRisk: matching.filter((student) => (student.subjects ?? []).some((item) => String(item.id) === String(subject.id) && (item.atRisk || item.riskLevel === "high"))).length };
  }), [students, subjects]);
  const departmentRiskCounts = useMemo(() => departments.map((name) => {
    const matching = students.filter((student) => (student.subjects ?? []).some((subject) => subject.department === name));
    return { name, total: matching.length, atRisk: matching.filter((student) => (student.subjects ?? []).some((subject) => subject.department === name && (subject.atRisk || subject.riskLevel === "high"))).length };
  }), [students, departments]);

  const professorLabel = data.professor?.name || data.professor?.email || "Professor";

  return (
    <div className="stack" style={{ gap: 24 }}>
      <div className="page-head">
          <div className="row-between dashboard-head-row">
            <div>
              <h1>Professor dashboard</h1>
              <p>Welcome, <strong>{professorLabel}</strong>. Review student risk and take action.</p>
            </div>
            <div className="dashboard-head-actions">
              <Badge tone={session?.user.hasCalendar ? "ok" : "neutral"}>
                {session?.user.hasCalendar ? "Calendar connected" : "Calendar not connected"}
              </Badge>
              <button className="btn btn-sm" type="button" onClick={() => signIn("google-professor")}>
                {session?.user.hasCalendar ? "Reconnect calendar" : "Connect Google Calendar"}
              </button>
            </div>
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
            <button
              className={`tab ${tab === "automation" ? "active" : ""}`}
              onClick={() => setTab("automation")}
              role="tab"
              aria-selected={tab === "automation"}
              type="button"
            >
              Automation
            </button>
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

      {tab === "students" ? <div className="stat-grid">
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
      </div> : null}

      {tab === "imports" ? <Card padded={false}>
        <CardHeader title="Subjects" subtitle="Add a subject before importing its attendance and test results." />
        <div className="card-body stack">
          {subjects.length > 0 ? <div className="chips">{subjects.map((subject) => <Badge key={String(subject.id)} tone="accent">{subjectLabel(subject)}</Badge>)}</div> : null}
          <form onSubmit={addSubject} className="subject-form">
            <label className="field"><span className="field-label">Subject name</span><input required className="input" value={subjectName} onChange={(event) => setSubjectName(event.target.value)} placeholder="Data structures" maxLength={120} /></label>
            <label className="field"><span className="field-label">Subject code</span><input className="input" value={subjectCode} onChange={(event) => setSubjectCode(event.target.value)} placeholder="CS201" maxLength={30} /></label>
            <label className="field"><span className="field-label">Department</span><input className="input" value={department} onChange={(event) => setDepartment(event.target.value)} placeholder="Computer Science" maxLength={120} /></label>
            <button className="btn btn-primary" disabled={savingSubject || !subjectName.trim()}>{savingSubject ? "Adding…" : "Add subject"}</button>
          </form>
          {subjectError ? <Alert tone="error" title="Subject could not be added">{subjectError}</Alert> : null}
        </div>
      </Card> : null}
      {tab === "students" ? (
        <div className="stack" style={{ gap: 16 }}>
        {(subjectRiskCounts.length > 0 || departmentRiskCounts.length > 0) ? <Card className="risk-breakdown-card">
          <div className="risk-breakdown-grid">
            {subjectRiskCounts.length > 0 ? <section><h2>Risk by subject</h2><p className="small muted">Students with attendance or marks concerns</p><div className="breakdown-chips">{subjectRiskCounts.map(({ subject, total, atRisk }) => <button key={String(subject.id)} className={`breakdown-chip ${subjectFilter === String(subject.id) ? "selected" : ""}`} type="button" onClick={() => setSubjectFilter(subjectFilter === String(subject.id) ? "all" : String(subject.id))}><span>{subject.code || subject.name}</span><strong>{atRisk} / {total} at risk</strong></button>)}</div></section> : null}
            {departmentRiskCounts.length > 0 ? <section><h2>Risk by department</h2><p className="small muted">Students with a subject in this department</p><div className="breakdown-chips">{departmentRiskCounts.map(({ name, total, atRisk }) => <button key={name} className={`breakdown-chip ${departmentFilter === name ? "selected" : ""}`} type="button" onClick={() => setDepartmentFilter(departmentFilter === name ? "all" : name)}><span>{name}</span><strong>{atRisk} / {total} at risk</strong></button>)}</div></section> : null}
          </div>
        </Card> : null}
        <Card padded={false}>
          <CardHeader
            title="Roster & risk"
            subtitle={`${filtered.length} of ${students.length} students · highest risk first`}
            actions={<button className="btn btn-sm" type="button" onClick={() => setTab("imports")}>Upload records</button>}
          />
          <div className="risk-filters">
            <label className="field filter-search"><span className="field-label">Find a student</span><input id="student-search" className="input" placeholder="Name, roll number or email" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
            <label className="field"><span className="field-label">Subject</span><select className="input" value={subjectFilter} onChange={(event) => setSubjectFilter(event.target.value)}><option value="all">All subjects</option>{subjects.map((subject) => <option key={String(subject.id)} value={String(subject.id)}>{subjectLabel(subject)}</option>)}</select></label>
            <label className="field"><span className="field-label">Department</span><select className="input" value={departmentFilter} onChange={(event) => setDepartmentFilter(event.target.value)}><option value="all">All departments</option>{departments.map((value) => <option key={value} value={value}>{value}</option>)}</select></label>
            <label className="field"><span className="field-label">Risk status</span><select className="input" value={riskFilter} onChange={(event) => setRiskFilter(event.target.value)}><option value="all">All risk levels</option><option value="high">At risk</option><option value="warn">Watch</option><option value="ok">On track</option><option value="unknown">No data</option></select></label>
            {query || subjectFilter !== "all" || departmentFilter !== "all" || riskFilter !== "all" ? <button className="btn btn-ghost btn-sm clear-filters" type="button" onClick={() => { setQuery(""); setSubjectFilter("all"); setDepartmentFilter("all"); setRiskFilter("all"); }}>Clear filters</button> : null}
          </div>
          {students.length === 0 ? (
            <EmptyState title="No students in the roster">
              Upload the roster CSV to populate this table.
            </EmptyState>
          ) : filtered.length === 0 ? (
            <EmptyState title="No matches">
              No students match these filters. Try clearing one or more filters.
            </EmptyState>
          ) : (
            <div className="table-wrap">
              <table className="data">
                <thead>
                  <tr>
                    <th>Roll no</th>
                    <th>Student</th>
                    <th>Department</th>
                    <th>Attendance &amp; marks</th>
                    <th>Overall attendance</th>
                    <th>Risk status</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((student) => (
                    <StudentRow key={String(student.id)} student={student} subjectFilter={subjectFilter} departmentFilter={departmentFilter} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
        </div>
      ) : null}
      {tab === "imports" ? (
        <UploadsPanel subjects={subjects} studentsCount={students.length} onImported={onChanged} />
      ) : null}
      {tab === "automation" ? (
        <AutomationCenter
          onOpenImports={() => setTab("imports")}
          hasStudents={students.length > 0}
          hasSubjects={subjects.length > 0}
        />
      ) : null}
    </div>
  );
}

function StudentRow({ student, subjectFilter, departmentFilter }: { student: Student; subjectFilter: string; departmentFilter: string }) {
  const overall = overallAttendance(student.subjects ?? []);
  const risk = studentRiskBadge(student);
  const visibleSubjects = (student.subjects ?? []).filter((subject) =>
    (subjectFilter === "all" || String(subject.id) === subjectFilter) &&
    (departmentFilter === "all" || subject.department === departmentFilter),
  );
  const departments = [...new Set(visibleSubjects.map((subject) => subject.department).filter((value): value is string => Boolean(value)))];

  return (
    <tr>
      <td className="mono">{student.rollNo ?? "—"}</td>
      <td>
        <div className="cell-strong">{student.name ?? "Unnamed"}</div>
        <div className="small muted">{student.email ?? "—"}</div>
      </td>
      <td>{departments.length ? departments.join(", ") : student.department ?? "—"}</td>
      <td>
        {visibleSubjects.length > 0 ? (
          <div className="subject-insights">
            {visibleSubjects.map((subject) => {
              const pct = attendancePercent(subject);
              const attendanceLow = pct !== null && pct < (subject.threshold ?? 85);
              const weakMarks = subject.latestScore !== null && subject.latestScore !== undefined && subject.latestScore < (subject.marksThreshold ?? 50);
              const fallingMarks = subject.latestScore !== null && subject.latestScore !== undefined && subject.previousScore !== null && subject.previousScore !== undefined && subject.previousScore - subject.latestScore >= 10;
              const reasons = [attendanceLow ? "Attendance below target" : null, weakMarks ? "Weak latest result" : null, fallingMarks ? "Marks falling" : null].filter(Boolean);
              const change = subject.latestScore !== null && subject.latestScore !== undefined && subject.previousScore !== null && subject.previousScore !== undefined
                ? subject.latestScore - subject.previousScore
                : null;
              return (
                <div className="subject-insight" key={String(subject.id)}>
                  <div className="subject-insight-head">
                    <strong>{subject.code || subject.name || `Subject ${subject.id}`}</strong>
                    {pct === null ? <Badge tone="neutral">No attendance</Badge> : <Badge tone={reasons.length ? "danger" : subject.riskLevel === "warn" ? "warn" : "ok"}>{formatPercent(pct)}</Badge>}
                  </div>
                  <div className="small muted">
                    {subject.total ? `${subject.attended ?? 0}/${subject.total} classes attended` : "No classes recorded"}
                    {attendanceLow ? ` · Attend ${subject.classesToRecover ?? 0} in a row to recover` : ""}
                  </div>
                  <div className="small">
                    {subject.latestScore === null || subject.latestScore === undefined
                      ? "No test results yet"
                      : `${subject.latestTestName || "Latest test"}: ${formatPercent(subject.latestScore)}${change === null ? "" : ` · ${change > 0 ? "+" : ""}${change.toFixed(1)} pp vs previous`}`}
                  </div>
                  {reasons.length ? <div className="subject-reasons">{reasons.map((reason) => <span key={reason}>{reason}</span>)}</div> : null}
                </div>
              );
            })}
          </div>
        ) : (
          <span className="muted small">No data for this subject</span>
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
