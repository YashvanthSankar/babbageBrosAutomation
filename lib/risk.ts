/**
 * Attendance / marks risk calculation.
 *
 * This module merges two contracts:
 *
 * 1. Legacy standalone helpers use default 85/90 thresholds. The dashboard
 *    (lib/dashboard.ts) uses the configurable threshold on each subject:
 *      attendancePercent = attended / total * 100   (0 classes => no data, not 0%)
 *      classesToRecover  = max(0, ceil((target * total - attended) / (1 - target)))
 *                          where target is the subject threshold as a fraction
 *      atRisk            = attendancePercent !== null && attendancePercent < target
 *      warn              = target <= attendancePercent < target + 5
 *
 * 2. The ingestion contract (ported from the `upload` branch) with a
 *    per-subject configurable threshold and the AT_RISK/WATCH/SAFE/NO_DATA
 *    status vocabulary used by the imported-API docs.
 *
 * The helpers below also support the imported-API contract and its tests.
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

/* ------------------------------------------------------------------------- *
 * Ingestion contract (ported from origin/upload lib/risk.ts)
 * ------------------------------------------------------------------------- */

export type RiskStatus = 'AT_RISK' | 'WATCH' | 'SAFE' | 'NO_DATA';

export function attendancePercentage(present: number, recorded: number): number | null {
  if (recorded <= 0) return null;
  return (present / recorded) * 100;
}

export function recoveryClasses(present: number, recorded: number, thresholdPercent: number): number {
  if (recorded <= 0) return 0;
  const threshold = thresholdPercent / 100;
  if (present / recorded >= threshold) return 0;
  return Math.max(0, Math.ceil((threshold * recorded - present) / (1 - threshold)));
}

export function riskStatus(percentage: number | null, threshold: number): RiskStatus {
  if (percentage === null) return 'NO_DATA';
  if (percentage < threshold) return 'AT_RISK';
  if (percentage < threshold + 5) return 'WATCH';
  return 'SAFE';
}

const STATUS_RANK: Record<RiskStatus, number> = { AT_RISK: 0, WATCH: 1, SAFE: 2, NO_DATA: 3 };

export function compareRisk(
  left: { status: RiskStatus; percentage: number | null; recoveryClasses: number; name: string },
  right: { status: RiskStatus; percentage: number | null; recoveryClasses: number; name: string },
): number {
  const statusDifference = STATUS_RANK[left.status] - STATUS_RANK[right.status];
  if (statusDifference) return statusDifference;
  if (left.status === 'AT_RISK') {
    const percentageDifference = (left.percentage ?? 101) - (right.percentage ?? 101);
    if (percentageDifference) return percentageDifference;
    const recoveryDifference = right.recoveryClasses - left.recoveryClasses;
    if (recoveryDifference) return recoveryDifference;
  }
  return left.name.localeCompare(right.name);
}
