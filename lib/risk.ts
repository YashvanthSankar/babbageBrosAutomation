/**
 * Attendance / marks risk calculation.
 *
 * The rules are fixed by docs/architecture.md and are computed, not AI-generated:
 *   attendancePercent = attended / total * 100            (0 classes => no data, not 0%)
 *   classesToRecover  = max(0, ceil((0.85 * total - attended) / 0.15))
 *   atRisk            = attendancePercent !== null && attendancePercent < 85
 *   warn              = 85 <= attendancePercent < 90
 */

export const ATTENDANCE_RISK_THRESHOLD = 85;
export const ATTENDANCE_WARN_THRESHOLD = 90;

export type Trend = 'up' | 'down' | 'flat' | 'none';
export type RiskLevel = 'high' | 'warn' | 'ok' | 'unknown';

export interface TestInput {
  name: string;
  date: string;
  score: number;
  maxScore: number;
}

export interface SubjectRisk {
  id: number;
  code: string;
  name: string;
  attended: number;
  total: number;
  attendancePercent: number | null;
  classesToRecover: number;
  latestScore: number | null;
  previousScore: number | null;
  latestTestName: string | null;
  trend: Trend;
  atRisk: boolean;
  riskLevel: RiskLevel;
}

export interface SubjectRiskInput {
  id: number;
  code: string;
  name: string;
  total: number;
  attended: number;
  tests: readonly TestInput[];
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function attendancePercent(total: number, attended: number): number | null {
  if (total <= 0) return null;
  return round2((attended / total) * 100);
}

export function classesToRecover(total: number, attended: number): number {
  if (total <= 0) return 0;
  const needed = ATTENDANCE_RISK_THRESHOLD / 100 * total - attended;
  if (needed <= 0) return 0;
  return Math.ceil(needed / (1 - ATTENDANCE_RISK_THRESHOLD / 100));
}

export function scorePercent(score: number, maxScore: number): number | null {
  if (!Number.isFinite(maxScore) || maxScore <= 0) return null;
  return round2((score / maxScore) * 100);
}

export function computeTrend(latest: number | null, previous: number | null): Trend {
  if (latest === null || previous === null) return 'none';
  if (latest > previous) return 'up';
  if (latest < previous) return 'down';
  return 'flat';
}

export function riskFromPercent(percent: number | null): RiskLevel {
  if (percent === null) return 'unknown';
  if (percent < ATTENDANCE_RISK_THRESHOLD) return 'high';
  if (percent < ATTENDANCE_WARN_THRESHOLD) return 'warn';
  return 'ok';
}

export function computeSubjectRisk(input: SubjectRiskInput): SubjectRisk {
  const percent = attendancePercent(input.total, input.attended);

  // Tests are expected sorted ascending by date; the last two are the
  // comparable latest/previous results.
  const ordered = [...input.tests].sort((a, b) => a.date.localeCompare(b.date));
  const latest = ordered.length > 0 ? ordered[ordered.length - 1] : null;
  const previous = ordered.length > 1 ? ordered[ordered.length - 2] : null;

  const latestPercent = latest ? scorePercent(latest.score, latest.maxScore) : null;
  const previousPercent = previous ? scorePercent(previous.score, previous.maxScore) : null;

  return {
    id: input.id,
    code: input.code,
    name: input.name,
    attended: input.attended,
    total: input.total,
    attendancePercent: percent,
    classesToRecover: classesToRecover(input.total, input.attended),
    latestScore: latestPercent,
    previousScore: previousPercent,
    latestTestName: latest ? latest.name : null,
    trend: computeTrend(latestPercent, previousPercent),
    atRisk: percent !== null && percent < ATTENDANCE_RISK_THRESHOLD,
    riskLevel: riskFromPercent(percent),
  };
}

const RISK_ORDER: Record<RiskLevel, number> = { high: 3, warn: 2, unknown: 1, ok: 0 };

export function overallRisk(levels: readonly RiskLevel[]): RiskLevel {
  let worst: RiskLevel = 'unknown';
  for (const level of levels) {
    if (RISK_ORDER[level] > RISK_ORDER[worst]) worst = level;
  }
  // A student with no attendance data at all is "unknown"; otherwise the worst
  // subject level wins (ok when every subject is healthy).
  if (worst === 'unknown' && levels.some((l) => l === 'ok' || l === 'warn' || l === 'high')) {
    return 'ok';
  }
  return worst;
}
