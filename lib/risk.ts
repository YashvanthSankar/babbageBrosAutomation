export type RiskStatus = "AT_RISK" | "WATCH" | "SAFE" | "NO_DATA";

export function attendancePercentage(present: number, recorded: number) {
  if (recorded <= 0) return null;
  return (present / recorded) * 100;
}

export function recoveryClasses(present: number, recorded: number, thresholdPercent: number) {
  if (recorded <= 0) return 0;
  const threshold = thresholdPercent / 100;
  if (present / recorded >= threshold) return 0;
  return Math.max(0, Math.ceil((threshold * recorded - present) / (1 - threshold)));
}

export function riskStatus(percentage: number | null, threshold: number): RiskStatus {
  if (percentage === null) return "NO_DATA";
  if (percentage < threshold) return "AT_RISK";
  if (percentage < threshold + 5) return "WATCH";
  return "SAFE";
}

const rank: Record<RiskStatus, number> = { AT_RISK: 0, WATCH: 1, SAFE: 2, NO_DATA: 3 };

export function compareRisk(
  left: { status: RiskStatus; percentage: number | null; recoveryClasses: number; name: string },
  right: { status: RiskStatus; percentage: number | null; recoveryClasses: number; name: string },
) {
  const statusDifference = rank[left.status] - rank[right.status];
  if (statusDifference) return statusDifference;
  if (left.status === "AT_RISK") {
    const percentageDifference = (left.percentage ?? 101) - (right.percentage ?? 101);
    if (percentageDifference) return percentageDifference;
    const recoveryDifference = right.recoveryClasses - left.recoveryClasses;
    if (recoveryDifference) return recoveryDifference;
  }
  return left.name.localeCompare(right.name);
}
