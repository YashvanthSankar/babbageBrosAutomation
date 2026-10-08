"use client";

import { useMemo, useState } from "react";
import type { StudentDashboard as StudentData, SubjectStat } from "./types";
import {
  attendancePercent,
  formatPercent,
  formatScorePercent,
  isSubjectAtRisk,
  riskStatTone,
  subjectLabel,
  subjectTrend,
  trendSymbol,
} from "./helpers";
import { Alert, Badge, Card, EmptyState, Progress, Stat } from "./ui";
import BookingPanel from "./BookingPanel";

export default function StudentDashboard({ data }: { data: StudentData }) {
  const student = data.student;
  const subjects = student.subjects ?? [];
  const [bookingSubjectId, setBookingSubjectId] = useState<string>("");

  const summary = useMemo(() => {
    let attended = 0;
    let total = 0;
    let recovery = 0;
    let atRisk = 0;
    for (const subject of subjects) {
      if (typeof subject.attended === "number") attended += subject.attended;
      if (typeof subject.total === "number") total += subject.total;
      if (typeof subject.classesToRecover === "number") recovery += subject.classesToRecover;
      if (isSubjectAtRisk(subject)) atRisk += 1;
    }
    return {
      attendance: total > 0 ? (attended / total) * 100 : null,
      recovery,
      atRisk,
      subjects: subjects.length,
    };
  }, [subjects]);

  const professorLabel = data.professor?.name || data.professor?.email;

  return (
    <div className="stack" style={{ gap: 24 }}>
      <div className="page-head">
        <div className="row-between">
          <div>
            <h1>Hi{student.name ? `, ${student.name.split(" ")[0]}` : ""} 👋</h1>
            <p>
              {student.rollNo ? <span className="mono">{student.rollNo}</span> : "Your record"}
              {student.department ? ` · ${student.department}` : ""}
              {professorLabel ? ` · Advisor: ${professorLabel}` : ""}
            </p>
          </div>
          {summary.atRisk > 0 ? (
            <Badge tone="danger">
              <span className="dot" aria-hidden />
              {summary.atRisk} subject{summary.atRisk === 1 ? "" : "s"} need attention
            </Badge>
          ) : (
            <Badge tone="ok">
              <span className="dot" aria-hidden />
              All subjects on track
            </Badge>
          )}
        </div>
      </div>

      <div className="stat-grid">
        <Stat label="Subjects" value={summary.subjects} hint="Enrolled with recorded data" />
        <Stat
          label="Attendance"
          value={formatPercent(summary.attendance)}
          tone={riskStatTone(summary.attendance)}
          hint="Across all subjects"
        />
        <Stat
          label="Recovery classes"
          value={summary.recovery}
          tone={summary.recovery > 0 ? "warn" : "ok"}
          hint="Classes needed to reach 85%"
        />
        <Stat
          label="At-risk subjects"
          value={summary.atRisk}
          tone={summary.atRisk > 0 ? "danger" : "ok"}
          hint="Below the 85% threshold"
        />
      </div>

      <section className="stack" style={{ gap: 14 }}>
        <div className="row-between">
          <h2 className="card-title">Your subjects</h2>
          <span className="small muted">Attendance, latest scores, and recovery plan</span>
        </div>

        {subjects.length === 0 ? (
          <Card>
            <EmptyState title="No subject data yet">
              Your professor has not imported attendance or marks for you yet. Check back after the
              next upload.
            </EmptyState>
          </Card>
        ) : (
          <div className="subject-grid">
            {subjects.map((subject) => (
              <SubjectCard
                key={String(subject.id)}
                subject={subject}
                onBook={() => setBookingSubjectId(String(subject.id))}
              />
            ))}
          </div>
        )}
      </section>

      <BookingPanel
        subjects={subjects}
        subjectId={bookingSubjectId}
        onSubjectChange={setBookingSubjectId}
      />
    </div>
  );
}

function SubjectCard({ subject, onBook }: { subject: SubjectStat; onBook: () => void }) {
  const pct = attendancePercent(subject);
  const atRisk = isSubjectAtRisk(subject);
  const trend = subjectTrend(subject);
  const recovery = typeof subject.classesToRecover === "number" ? subject.classesToRecover : null;

  return (
    <article className={`subject-card ${atRisk ? "risk" : ""}`}>
      <div className="subject-head">
        <div>
          <div className="subject-name">{subject.name || subjectLabel(subject)}</div>
          <div className="subject-code">{subject.code || `#${subject.id}`}</div>
        </div>
        {atRisk ? <Badge tone="danger">At risk</Badge> : <Badge tone="ok">On track</Badge>}
      </div>

      <div className="stack" style={{ gap: 8 }}>
        <div className="row-between">
          <span className="small muted">Attendance</span>
          <span className="small mono">
            {typeof subject.attended === "number" && typeof subject.total === "number"
              ? `${subject.attended} / ${subject.total} classes`
              : "—"}
          </span>
        </div>
        <div className="progress-row">
          <Progress percent={pct ?? 0} />
          <span className="small mono" style={{ minWidth: 46, textAlign: "right" }}>
            {formatPercent(pct)}
          </span>
        </div>
      </div>

      <div className="metric-row">
        <div className="metric">
          <span className="metric-label">Latest</span>
          <span className="metric-value">{formatScorePercent(subject.latestScore)}</span>
        </div>
        <div className="metric">
          <span className="metric-label">Previous</span>
          <span className="metric-value">{formatScorePercent(subject.previousScore)}</span>
        </div>
        <div className="metric">
          <span className="metric-label">Trend</span>
          <span className={`metric-value trend-${trend === "none" ? "flat" : trend}`}>
            {trend === "none" ? "—" : `${trendSymbol(trend)} ${trend}`}
          </span>
        </div>
      </div>
      {subject.latestTestName ? (
        <div className="small muted" style={{ marginTop: -4 }}>
          Latest test: {subject.latestTestName}
        </div>
      ) : null}

      <div className="row-between">
        <span className="small">
          {recovery === null ? (
            <span className="muted">Recovery data unavailable</span>
          ) : recovery > 0 ? (
            <span style={{ color: "var(--warn)", fontWeight: 600 }}>
              {recovery} recovery class{recovery === 1 ? "" : "es"} needed
            </span>
          ) : (
            <span style={{ color: "var(--ok)", fontWeight: 600 }}>No recovery needed</span>
          )}
        </span>
        <button className="btn btn-sm" onClick={onBook} type="button">
          Book slot
        </button>
      </div>
    </article>
  );
}
