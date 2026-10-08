"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { signOut } from "next-auth/react";
import { apiGet, apiPostJson } from "./api";
import type { AdminDashboard as AdminData, Student, SubjectStat } from "./types";
import { attendancePercent, formatPercent, initials, studentRiskBadge, subjectLabel, summarize, uniqueSubjects } from "./helpers";
import { Alert, Badge, Card, CardHeader, EmptyState, Progress } from "./ui";
import Icon from "./Icon";
import UploadsPanel from "./UploadsPanel";
import AutomationCenter from "./AutomationCenter";
import CalendarConnect from "./CalendarConnect";

type Tab = "students" | "imports" | "automation";
const navigation = [
  { id: "students" as const, label: "Overview", icon: "grid" as const },
  { id: "imports" as const, label: "Import records", icon: "upload" as const },
  { id: "automation" as const, label: "Automations", icon: "spark" as const },
];
const riskRank: Record<string, number> = { high: 0, warn: 1, ok: 2, unknown: 3 };

function levelFor(subjects: SubjectStat[]): string {
  return subjects.reduce((worst, subject) => (riskRank[subject.riskLevel ?? "unknown"] < riskRank[worst] ? subject.riskLevel ?? "unknown" : worst), "unknown");
}

export default function AdminDashboard({ data, onChanged }: { data: AdminData; onChanged: () => void }) {
  const [tab, setTab] = useState<Tab>("students");
  const [page, setPage] = useState(1);
  const pageSize = 8;
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
  const students = data.students ?? [];
  const summary = useMemo(() => summarize(students), [students]);
  const subjects = useMemo(() => ownedSubjects.length ? ownedSubjects : data.subjects?.length ? data.subjects : uniqueSubjects(students), [students, ownedSubjects, data.subjects]);
  useEffect(() => {
    let active = true;
    apiGet<{ subjects: SubjectStat[] }>("/api/subjects").then(result => { if (active && result.ok) setOwnedSubjects(result.data?.subjects ?? []); });
    return () => { active = false; };
  }, [data]);

  async function addSubject(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setSavingSubject(true); setSubjectError(null);
    const result = await apiPostJson<SubjectStat>("/api/subjects", { name: subjectName.trim(), code: subjectCode.trim(), department: department.trim(), threshold: 85, marksThreshold: 50 });
    setSavingSubject(false);
    if (!result.ok || !result.data) { setSubjectError(result.error ?? "Could not add subject."); return; }
    setOwnedSubjects(previous => [...previous, result.data!]); setSubjectName(""); setSubjectCode(""); setDepartment(""); onChanged();
  }

  const scopedSubjects = (student: Student) => (student.subjects ?? []).filter(subject => (subjectFilter === "all" || String(subject.id) === subjectFilter) && (departmentFilter === "all" || subject.department === departmentFilter));
  const filtered = students.filter(student => {
    const rows = scopedSubjects(student);
    const level = subjectFilter !== "all" || departmentFilter !== "all" ? levelFor(rows) : String(student.riskLevel ?? "unknown");
    const text = [student.name, student.rollNo, student.email, ...rows.flatMap(subject => [subject.name, subject.code, subject.department])].filter(Boolean).join(" ").toLowerCase();
    return (!query.trim() || text.includes(query.trim().toLowerCase())) && ((subjectFilter === "all" && departmentFilter === "all") || rows.length > 0) && (riskFilter === "all" || level === riskFilter);
  }).sort((a, b) => (riskRank[levelFor(scopedSubjects(a))] ?? 3) - (riskRank[levelFor(scopedSubjects(b))] ?? 3) || lowestAttendance(scopedSubjects(a)) - lowestAttendance(scopedSubjects(b)));
  const departments = [...new Set(subjects.map(subject => subject.department).filter((value): value is string => Boolean(value)))].sort();
  const counts = { high: students.filter(s => s.riskLevel === "high").length, warn: students.filter(s => s.riskLevel === "warn").length, ok: students.filter(s => s.riskLevel === "ok").length, unknown: students.filter(s => s.riskLevel === "unknown").length };
  const subjectRisks = subjects.map(subject => {
    const relevant = students.flatMap(student => (student.subjects ?? []).filter(row => String(row.id) === String(subject.id)));
    return { subject, total: relevant.length, high: relevant.filter(row => row.riskLevel === "high" || row.atRisk).length };
  });
  useEffect(() => setPage(1), [query, subjectFilter, departmentFilter, riskFilter]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const visibleStudents = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const title = tab === "students" ? "Overview" : tab === "imports" ? "Bring your records together" : "Your support workflows";
  const subtitle = tab === "students" ? "A clear view of who needs support, and what to do next." : tab === "imports" ? "Start with your roster, then add attendance and assessment results." : "Track warning emails, provider readiness and appointment availability.";

  return <div className="workspace">
    <aside className="workspace-sidebar">
      <div className="workspace-brand"><span className="workspace-brand-mark"><Icon name="book" size={22} /></span><div><strong>Student Success</strong><span>Babbage Bros</span></div></div>
      <div className="workspace-label">Workspace</div>
      <nav className="workspace-nav" aria-label="Faculty navigation">
        {navigation.map(item => <button type="button" key={item.id} className={tab === item.id ? "selected" : ""} aria-current={tab === item.id ? "page" : undefined} onClick={() => setTab(item.id)}><Icon name={item.icon} /><span>{item.label}</span>{item.id === "students" && counts.high > 0 ? <span className="nav-count">{counts.high}</span> : null}</button>)}
      </nav>
      <div className="sidebar-bottom"><span className="avatar avatar-fallback">{initials(data.professor?.name || "Professor")}</span><div><strong>{data.professor?.name || "Professor"}</strong><span>Faculty workspace</span></div><button type="button" className="sidebar-signout" aria-label="Sign out" onClick={() => signOut()}><Icon name="logout" size={18} /></button></div>
    </aside>
    <div className="workspace-content">
      <div className="workspace-topbar"><div className="workspace-breadcrumb">Workspace <Icon name="chevron" size={14} /> {navigation.find(item => item.id === tab)?.label}</div><div className="workspace-topbar-right"><span className="demo-access-label">Competition demo</span><CalendarConnect professorEmail={data.professor?.email ?? ""} /><span>{data.professor?.email}</span></div></div>
      <header className="overview-header"><div><h1>{title}</h1><p>{subtitle}</p></div><div className="overview-actions"><button type="button" className="btn icon-button" aria-label="Refresh dashboard" onClick={onChanged}><Icon name="refresh" /></button>{tab === "students" ? <button type="button" className="btn btn-primary" onClick={() => setTab("imports")}><Icon name="upload" size={17} />Import records</button> : null}</div></header>

      {tab === "students" ? <>
        <div className="overview-metrics">
          <Metric label="Total students" value={data.stats?.students ?? students.length} hint="In your active roster" icon="users" />
          <Metric label="Need attention" value={counts.high} hint="Attendance or marks concerns" icon="alert" tone="danger" />
          <Metric label="Subjects" value={data.stats?.subjects ?? subjects.length} hint={`${departments.length} department${departments.length === 1 ? "" : "s"} represented`} icon="book" />
          <Metric label="Avg. attendance" value={formatPercent(summary.avgAttendance)} hint="Across recorded classes" icon="chart" />
        </div>
        <div className="overview-panels">
          <Card className="cohort-card"><div className="section-heading"><div><h2>Risk distribution</h2><p>From attendance and recent assessments</p></div></div>
            <div className="health-body"><div className="health-strip" role="img" aria-label={`${counts.high} at risk, ${counts.warn} on watch, ${counts.ok} on track, ${counts.unknown} without data`}>{([{ key: "high", color: "danger" }, { key: "warn", color: "warn" }, { key: "ok", color: "ok" }, { key: "unknown", color: "neutral" }] as const).map(item => <span key={item.key} className={item.color} style={{ flex: counts[item.key] }} />)}</div><div className="health-legend">{([{ key: "high", label: "At risk", color: "danger" }, { key: "warn", label: "Watch closely", color: "warn" }, { key: "ok", label: "On track", color: "ok" }, { key: "unknown", label: "No data yet", color: "neutral" }] as const).map(item => <button type="button" key={item.key} className={riskFilter === item.key ? "selected" : ""} onClick={() => setRiskFilter(riskFilter === item.key ? "all" : item.key)} aria-pressed={riskFilter === item.key}><span className={`legend-dot ${item.color}`} /><span>{item.label}</span><strong>{counts[item.key]}</strong></button>)}</div></div>
          </Card>
          <Card className="subject-health-card"><div className="section-heading"><div><h2>Risk by subject</h2><p>Students with attendance or marks concerns</p></div><span className="small muted">{subjects.length} subjects</span></div>
            {subjectRisks.length ? <div className="subject-health-list">{subjectRisks.map(({ subject, high, total }) => <button type="button" key={String(subject.id)} className={`subject-health-row ${subjectFilter === String(subject.id) ? "selected" : ""}`} onClick={() => setSubjectFilter(subjectFilter === String(subject.id) ? "all" : String(subject.id))} aria-pressed={subjectFilter === String(subject.id)}><div><strong>{subject.code || subject.name}</strong><span>{subject.name} {subject.department ? `· ${subject.department}` : ""}</span></div><div className="subject-health-meter"><span><strong>{high}</strong> / {total} at risk</span><div className="mini-track"><i style={{ width: total ? `${high / total * 100}%` : "0%" }} /></div></div><Icon name="chevron" size={15} /></button>)}</div> : <div className="quiet-empty">Add a subject to see where support is needed.</div>}
          </Card>
        </div>
        {departments.length ? <div className="department-strip"><span>Departments</span>{departments.map(name => { const atRisk = students.filter(student => (student.subjects ?? []).some(subject => subject.department === name && subject.riskLevel === "high")).length; return <button type="button" key={name} className={departmentFilter === name ? "selected" : ""} aria-pressed={departmentFilter === name} onClick={() => setDepartmentFilter(departmentFilter === name ? "all" : name)}>{name}<span>{atRisk} at risk</span></button>; })}</div> : null}
        <Card padded={false} className="student-directory"><CardHeader title="Students" subtitle="Prioritized by risk. Select a student to see their recovery plan." actions={<span className="directory-count">{filtered.length} {filtered.length === 1 ? "student" : "students"}</span>} />
          <div className="directory-toolbar"><label className="directory-search"><Icon name="search" size={18} /><input aria-label="Search students" placeholder="Search name, roll number or email…" value={query} onChange={event => setQuery(event.target.value)} /></label><select className="input" aria-label="Filter by subject" value={subjectFilter} onChange={event => setSubjectFilter(event.target.value)}><option value="all">All subjects</option>{subjects.map(subject => <option key={String(subject.id)} value={String(subject.id)}>{subjectLabel(subject)}</option>)}</select><select className="input" aria-label="Filter by department" value={departmentFilter} onChange={event => setDepartmentFilter(event.target.value)}><option value="all">All departments</option>{departments.map(name => <option key={name} value={name}>{name}</option>)}</select><select className="input" aria-label="Filter by risk" value={riskFilter} onChange={event => setRiskFilter(event.target.value)}><option value="all">All risk levels</option><option value="high">At risk</option><option value="warn">Watch</option><option value="ok">On track</option><option value="unknown">No data</option></select>{query || subjectFilter !== "all" || departmentFilter !== "all" || riskFilter !== "all" ? <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setQuery(""); setSubjectFilter("all"); setDepartmentFilter("all"); setRiskFilter("all"); }}>Reset</button> : null}</div>
          {filtered.length ? <div className="table-wrap"><table className="data directory-table"><thead><tr><th>Student</th><th>Attendance</th><th>Recent marks</th><th>Recovery plan</th><th>Status</th><th><span className="sr-only">View details</span></th></tr></thead><tbody>{visibleStudents.map(student => <StudentRow key={String(student.id)} student={student} subjects={scopedSubjects(student)} />)}</tbody></table></div> : <EmptyState title={students.length ? "No matching students" : "Your workspace starts here"}>{students.length ? "Try another search or reset your filters." : <><p>Import your roster to start supporting your students.</p><button type="button" className="btn btn-primary" style={{ marginTop: 16 }} onClick={() => setTab("imports")}><Icon name="upload" size={16} />Import your roster</button></>}</EmptyState>}
          <div className="directory-footer"><span>{filtered.length ? `Showing ${(currentPage - 1) * pageSize + 1}–${Math.min(currentPage * pageSize, filtered.length)} of ${filtered.length} students` : "No students to display"}</span><div className="pagination"><button type="button" className="btn btn-sm" disabled={currentPage === 1} onClick={() => setPage(currentPage - 1)}>Previous</button><span>{currentPage} / {pageCount}</span><button type="button" className="btn btn-sm" disabled={currentPage === pageCount} onClick={() => setPage(currentPage + 1)}>Next</button></div></div>
        </Card>
      </> : null}
      {tab === "imports" ? <><Card padded={false}><CardHeader title="Set up your subjects" subtitle="Each subject starts with an 85% attendance and 50% marks threshold." /><div className="card-body stack">{subjects.length ? <div className="chips">{subjects.map(subject => <Badge key={String(subject.id)} tone="accent">{subjectLabel(subject)}</Badge>)}</div> : null}<form onSubmit={addSubject} className="subject-form"><label className="field"><span className="field-label">Subject name</span><input required className="input" value={subjectName} onChange={event => setSubjectName(event.target.value)} placeholder="Data structures" maxLength={120} /></label><label className="field"><span className="field-label">Subject code</span><input className="input" value={subjectCode} onChange={event => setSubjectCode(event.target.value)} placeholder="CS201" maxLength={30} /></label><label className="field"><span className="field-label">Department</span><input className="input" value={department} onChange={event => setDepartment(event.target.value)} placeholder="Computer Science" maxLength={120} /></label><button className="btn btn-primary" disabled={savingSubject || !subjectName.trim()}>{savingSubject ? "Adding…" : "Add subject"}</button></form>{subjectError ? <Alert tone="error" title="Subject could not be added">{subjectError}</Alert> : null}</div></Card><UploadsPanel subjects={subjects} studentsCount={students.length} onImported={onChanged} /></> : null}
      {tab === "automation" ? <AutomationCenter onOpenImports={() => setTab("imports")} hasStudents={students.length > 0} hasSubjects={subjects.length > 0} /> : null}
    </div>
  </div>;
}

function Metric({ label, value, hint, icon, tone = "accent" }: { label: string; value: React.ReactNode; hint: string; icon: "users" | "alert" | "book" | "chart"; tone?: "accent" | "danger" }) {
  return <div className={`overview-metric ${tone}`}><div className="metric-top"><span>{label}</span><span className="metric-icon"><Icon name={icon} size={18} /></span></div><strong>{value}</strong><p>{hint}</p></div>;
}
function lowestAttendance(subjects: SubjectStat[]) { return Math.min(...subjects.map(subject => attendancePercent(subject) ?? 101), 101); }
function StudentRow({ student, subjects }: { student: Student; subjects: SubjectStat[] }) {
  const [expanded, setExpanded] = useState(false);
  const total = subjects.reduce((sum, subject) => sum + (subject.total ?? 0), 0);
  const attended = subjects.reduce((sum, subject) => sum + (subject.attended ?? 0), 0);
  const overall = total ? attended / total * 100 : null;
  const scopedLevel = levelFor(subjects);
  const risk = studentRiskBadge({ ...student, riskLevel: scopedLevel, subjects });
  const marked = subjects.filter(subject => subject.latestScore !== null && subject.latestScore !== undefined).sort((a, b) => (a.latestScore ?? 101) - (b.latestScore ?? 101));
  const latest = marked[0];
  const recovery = subjects.filter(subject => (subject.classesToRecover ?? 0) > 0).sort((a,b) => (b.classesToRecover ?? 0) - (a.classesToRecover ?? 0))[0];
  const detailId = `student-details-${student.id}`;
  return <Fragment><tr className={expanded ? "expanded" : ""}><td><div className="directory-person"><span className={`student-avatar ${scopedLevel === "high" ? "at-risk" : ""}`}>{initials(student.name || student.email)}</span><div><strong>{student.name || "Unnamed student"}</strong><span>{student.rollNo || "No roll number"} <i>·</i> {student.email || "No email"}</span></div></div></td><td><div className="attendance-cell"><strong>{formatPercent(overall)}</strong><Progress percent={overall ?? 0} tone={scopedLevel === "high" ? "danger" : scopedLevel === "warn" ? "warn" : "ok"} /><span>{total ? `${attended} of ${total} classes` : "No classes recorded"}</span></div></td><td><div className="result-cell"><strong>{latest ? formatPercent(latest.latestScore ?? null) : "—"}</strong><span>{latest ? `${latest.code || latest.name} · ${latest.latestTestName || "Latest test"}` : "No assessment yet"}</span></div></td><td><div className="recovery-cell"><strong>{recovery ? `${recovery.classesToRecover} classes` : overall === null ? "—" : "On target"}</strong><span>{recovery ? `${recovery.code || recovery.name} · consecutive` : overall === null ? "No attendance data" : "No recovery needed"}</span></div></td><td><Badge tone={risk.tone}><span className="dot" />{risk.label}</Badge></td><td><button type="button" className={`btn detail-button ${expanded ? "open" : ""}`} aria-expanded={expanded} aria-controls={detailId} aria-label={`${expanded ? "Hide" : "View"} details for ${student.name || student.rollNo}`} onClick={() => setExpanded(!expanded)}><span>{expanded ? "Close" : "Details"}</span><Icon name="chevron" size={16} /></button></td></tr>
    {expanded ? <tr className="detail-row" id={detailId}><td colSpan={6}><div className="student-details-header"><strong>Subject breakdown</strong><span>Attendance, recovery and comparable test results</span></div><div className="student-detail-grid">{subjects.map(subject => { const pct = attendancePercent(subject), low = pct !== null && pct < (subject.threshold ?? 85), weak = subject.latestScore != null && subject.latestScore < (subject.marksThreshold ?? 50), fall = subject.latestScore != null && subject.previousScore != null && subject.previousScore - subject.latestScore >= 10; return <div className="student-detail-card" key={String(subject.id)}><div className="row-between"><strong>{subjectLabel(subject)}</strong><Badge tone={low || weak || fall ? "danger" : "neutral"}>{low || weak || fall ? "Needs support" : pct === null && subject.latestScore == null ? "No data" : "On track"}</Badge></div><span className="small muted">{subject.department || "Department not assigned"}</span><div className="detail-metrics"><div><span>Attendance</span><strong>{formatPercent(pct)}</strong><small>Target {subject.threshold ?? 85}%</small></div><div><span>Latest marks</span><strong>{formatPercent(subject.latestScore ?? null)}</strong><small>{subject.latestTestName || "No assessment"}</small></div><div><span>Previous marks</span><strong>{formatPercent(subject.previousScore ?? null)}</strong><small>Comparable percentage</small></div></div>{low ? <div className="recovery-note"><Icon name="clock" size={16} /><span>Attend <strong>{subject.classesToRecover ?? 0} consecutive classes</strong> to recover.</span></div> : null}{weak || fall ? <div className="marks-note"><Icon name="alert" size={16} /><span>{weak ? `Latest marks are below ${subject.marksThreshold ?? 50}%. ` : ""}{fall ? `Dropped ${((subject.previousScore ?? 0) - (subject.latestScore ?? 0)).toFixed(1)} percentage points.` : ""}</span></div> : null}</div>; })}{!subjects.length ? <p className="muted">No subject records yet.</p> : null}</div></td></tr> : null}
  </Fragment>;
}
