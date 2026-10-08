"use client";

import { useEffect, useMemo, useState } from "react";
import { signIn, useSession } from 'next-auth/react';
import { apiGet, apiPostJson } from "./api";
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

type CallStatus = {
  state: "idle" | "pending" | "success" | "error";
  message?: string;
  buttonLabel?: string;
};

type VoiceCallResponse = {
  call?: {
    status?: "synthetic_demo" | "not_at_risk";
  };
};

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
  const [ownedSubjects, setOwnedSubjects] = useState<SubjectStat[]>([]);
  const [subjectName, setSubjectName] = useState("");
  const [subjectCode, setSubjectCode] = useState("");
  const [department, setDepartment] = useState("");
  const [subjectError, setSubjectError] = useState<string | null>(null);
  const [savingSubject, setSavingSubject] = useState(false);
  const [demoPhone, setDemoPhone] = useState("");
  const [demoCallState, setDemoCallState] = useState<CallStatus>({ state: "idle" });
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
      name: subjectName.trim(), code: subjectCode.trim(), department: department.trim(), threshold: 85, attendanceThreshold: 85, marksThreshold: 50,
    });
    setSavingSubject(false);
    if (!result.ok || !result.data) { setSubjectError(result.error ?? "Could not add subject."); return; }
    setOwnedSubjects((previous) => [...previous, result.data!]);
    setSubjectName(""); setSubjectCode(""); setDepartment("");
    onChanged();
  }

  async function dispatchDemoCall(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const phone = demoPhone.trim();
    if (!/^\+91[6-9]\d{9}$/.test(phone)) {
      setDemoCallState({ state: "error", message: "Enter an Indian number in +91 E.164 format." });
      return;
    }
    setDemoCallState({ state: "pending" });
    const result = await apiPostJson<{ call?: { attendancePercentage?: number } }>("/api/voice/demo-call", { phone });
    setDemoCallState(result.ok
      ? { state: "success", message: "Demo call dispatched with 69% attendance context." }
      : { state: "error", message: result.error ?? "Could not dispatch the demo call." });
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

      <Card padded={false} className="demo-call-card">
        <CardHeader
          title="Call your number for example"
          subtitle="Hear the attendance-risk agent as a student currently at 69% attendance."
          actions={<Badge tone="danger">69% attendance</Badge>}
        />
        <div className="card-body">
          <form className="demo-call-form" onSubmit={dispatchDemoCall}>
            <label className="field demo-call-field">
              <span className="field-label">Your phone number</span>
              <input
                className="input"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                placeholder="+919876543210"
                value={demoPhone}
                onChange={(event) => {
                  setDemoPhone(event.target.value);
                  if (demoCallState.state !== "idle") setDemoCallState({ state: "idle" });
                }}
                disabled={demoCallState.state === "pending"}
                required
              />
            </label>
            <button className="btn btn-primary demo-call-button" type="submit" disabled={demoCallState.state === "pending"}>
              {demoCallState.state === "pending" ? "Calling…" : "Call me with the demo agent"}
            </button>
          </form>
          <p className="field-hint demo-call-note">Only the fixed synthetic attendance value is sent to the voice agent. Demo calls are rate-limited.</p>
          {demoCallState.message ? (
            <div className={`demo-call-result ${demoCallState.state === "error" ? "error" : "success"}`} role={demoCallState.state === "error" ? "alert" : "status"}>
              {demoCallState.message}
            </div>
          ) : null}
        </div>
      </Card>

      {/* Temporarily hidden for the showcase; retain this block for restoring Calendar integration.
      <Card padded={false}>
        <CardHeader
          title="Appointment scheduling"
          subtitle="Students can request subject-specific advising appointments from available slots."
          actions={<Badge tone="accent">{session?.user.hasCalendar?'Google Calendar connected':'In-app appointments'}</Badge>}
        />
        <div className="card-body stack" style={{ gap: 12 }}>
          <Alert tone="info" title="Student appointments">
            Students select a subject, date, and open appointment slot. The service checks slot
            availability again when the booking is confirmed, preventing duplicate reservations.
          </Alert>
          <div className="row-between"><p className="small muted">Connect your Google Calendar to check teaching commitments and add consultation events.</p><button className="btn btn-sm" type="button" onClick={()=>signIn('google-professor')}>Connect Google Calendar</button></div>
        </div>
      </Card>
      */}

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
            <EmptyState title="No students in the roster">
              Upload the roster CSV to populate this table.
            </EmptyState>
          ) : filtered.length === 0 ? (
            <EmptyState title="No matches">
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
                    <th>Actions</th>
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
  const [calls, setCalls] = useState<Record<string, CallStatus>>({});

  async function callStudent(subject: SubjectStat) {
    const key = String(subject.id);
    setCalls((current) => ({ ...current, [key]: { state: "pending" } }));
    const result = await apiPostJson<VoiceCallResponse>("/api/voice/call", {
      studentId: String(student.id),
      subjectId: key,
    });
    if (!result.ok) {
      setCalls((current) => ({
        ...current,
        [key]: { state: "error", message: result.error ?? "Could not dispatch the call." },
      }));
      return;
    }

    const status = result.data?.call?.status;
    const message = status === "not_at_risk"
        ? "Attendance is no longer below the threshold."
        : "These are synthetic student details, so no call was placed. Use the example call above with your own number.";
    setCalls((current) => ({
      ...current,
      [key]: { state: "success", message, buttonLabel: status === "synthetic_demo" ? "Demo only" : "Not at risk" },
    }));
  }

  const attendanceRisks = (student.subjects ?? []).filter((subject) => {
    const percent = attendancePercent(subject);
    return percent !== null && percent < (subject.threshold ?? 85);
  });

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
      <td>
        {attendanceRisks.length > 0 ? (
          <div className="call-actions">
            {attendanceRisks.map((subject) => {
              const key = String(subject.id);
              const call = calls[key] ?? { state: "idle" as const };
              const complete = call.state === "success";
              return (
                <div className="call-action" key={key}>
                  <button
                    className="btn btn-sm"
                    type="button"
                    disabled={call.state === "pending" || complete}
                    onClick={() => callStudent(subject)}
                    aria-label={`Call ${student.name ?? "student"} about ${subjectLabel(subject)}`}
                  >
                    {call.state === "pending" ? "Checking…" : complete ? call.buttonLabel : "Call student"}
                    <span className="mono call-subject">{subject.code || subject.name}</span>
                  </button>
                  {call.message ? (
                    <span
                      className={`call-status ${call.state === "error" ? "call-status-error" : ""}`}
                      role={call.state === "error" ? "alert" : "status"}
                    >
                      {call.message}
                    </span>
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : (
          <span className="muted small">—</span>
        )}
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
