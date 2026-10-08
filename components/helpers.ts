import type { Student, SubjectStat } from "./types";

/** A subject is risky when the backend flags it or attendance falls below 85%. */
export function isSubjectAtRisk(subject: SubjectStat): boolean {
  if (typeof subject.atRisk === "boolean") return subject.atRisk;
  const pct = attendancePercent(subject);
  if (pct === null) return false;
  return pct < 85;
}

/** A student is risky when flagged by the backend or any of their subjects is. */
export function isStudentAtRisk(student: Student): boolean {
  if (student.riskLevel != null) {
    const level = String(student.riskLevel).toLowerCase();
    if (["high", "medium", "warn", "warning", "true", "1", "risk", "at-risk"].includes(level)) {
      return true;
    }
    // ok / unknown / low / none → fall through to the subject-level check.
  }
  return (student.subjects ?? []).some(isSubjectAtRisk);
}

export type RiskBadge = { tone: "ok" | "warn" | "danger" | "neutral"; label: string };

/** Map the backend RiskLevel to a display badge. */
export function studentRiskBadge(student: Student): RiskBadge {
  const level = student.riskLevel != null ? String(student.riskLevel).toLowerCase() : null;
  if (level === "high") return { tone: "danger", label: "At risk" };
  if (level === "warn") return { tone: "warn", label: "Watch" };
  if (level === "ok") return { tone: "ok", label: "On track" };
  if (level === "unknown") return { tone: "neutral", label: "No data" };
  return isStudentAtRisk(student)
    ? { tone: "danger", label: "At risk" }
    : { tone: "ok", label: "On track" };
}

export function attendancePercent(subject: SubjectStat): number | null {
  if (typeof subject.attendancePercent === "number" && Number.isFinite(subject.attendancePercent)) {
    return clamp(subject.attendancePercent, 0, 100);
  }
  if (typeof subject.attended === "number" && typeof subject.total === "number" && subject.total > 0) {
    return clamp((subject.attended / subject.total) * 100, 0, 100);
  }
  return null;
}

export function riskTone(pct: number | null): "ok" | "warn" | "danger" | "neutral" {
  if (pct === null) return "neutral";
  if (pct < 75) return "danger";
  if (pct < 85) return "warn";
  return "ok";
}

/** riskTone mapped to the Stat component's tone palette. */
export function riskStatTone(pct: number | null): "accent" | "ok" | "warn" | "danger" {
  const tone = riskTone(pct);
  return tone === "neutral" ? "accent" : tone;
}

export function formatPercent(value: number | null): string {
  if (value === null) return "—";
  return `${Math.round(value * 10) / 10}%`;
}

export function formatScore(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return "—";
  const n = Number(value);
  return Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);
}

/**
 * Scores from the dashboard are percentages (lib/risk.ts scorePercent), so they
 * are rendered with a % suffix rather than a raw mark.
 */
export function formatScorePercent(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return "—";
  const n = Number(value);
  return `${Math.round(n * 10) / 10}%`;
}

export type Trend = "up" | "down" | "flat" | "none";

export function scoreTrend(
  latest: number | null | undefined,
  previous: number | null | undefined,
): Trend {
  if (latest === null || latest === undefined || previous === null || previous === undefined) {
    return "none";
  }
  const a = Number(latest);
  const b = Number(previous);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return "none";
  if (a > b) return "up";
  if (a < b) return "down";
  return "flat";
}

export function trendSymbol(trend: Trend): string {
  switch (trend) {
    case "up":
      return "▲";
    case "down":
      return "▼";
    case "flat":
      return "▬";
    default:
      return "";
  }
}

/** Prefer the backend-computed trend; fall back to comparing the two scores. */
export function subjectTrend(subject: SubjectStat): Trend {
  if (subject.trend) return subject.trend;
  return scoreTrend(subject.latestScore, subject.previousScore);
}

export function subjectLabel(subject: SubjectStat): string {
  const code = subject.code?.trim();
  const name = subject.name?.trim();
  if (code && name) return `${code} — ${name}`;
  return code || name || `Subject ${subject.id}`;
}

export function initials(nameOrEmail?: string | null): string {
  if (!nameOrEmail) return "?";
  const base = nameOrEmail.split("@")[0].replace(/\([^)]*\)/g, '').trim();
  const parts = base.split(/[\s._-]+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function uniqueSubjects(students: Student[]): SubjectStat[] {
  const seen = new Map<string, SubjectStat>();
  for (const student of students) {
    for (const subject of student.subjects ?? []) {
      const key = String(subject.id ?? subject.code ?? subject.name);
      if (!seen.has(key)) seen.set(key, subject);
    }
  }
  return Array.from(seen.values()).sort((a, b) =>
    subjectLabel(a).localeCompare(subjectLabel(b)),
  );
}

export type AdminSummary = {
  students: number;
  atRisk: number;
  subjects: number;
  avgAttendance: number | null;
};

export function summarize(students: Student[]): AdminSummary {
  let attended = 0;
  let total = 0;
  const subjects = new Set<string>();
  for (const student of students) {
    for (const subject of student.subjects ?? []) {
      subjects.add(String(subject.id ?? subject.code ?? subject.name));
      if (typeof subject.attended === "number") attended += subject.attended;
      if (typeof subject.total === "number") total += subject.total;
    }
  }
  return {
    students: students.length,
    atRisk: students.filter(isStudentAtRisk).length,
    subjects: subjects.size,
    avgAttendance: total > 0 ? clamp((attended / total) * 100, 0, 100) : null,
  };
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}
