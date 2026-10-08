export type MarksRiskStatus = "CRITICAL" | "WEAK" | "FALLING" | "STABLE" | "NO_DATA";

export function marksRisk(latest: number | null, previous: number | null, threshold: number) {
  if (latest === null) return { status: "NO_DATA" as const, weak: false, falling: false, change: null };
  const weak = latest < threshold;
  const change = previous === null ? null : latest - previous;
  const falling = change !== null && change <= -10;
  const status: MarksRiskStatus = weak && falling ? "CRITICAL" : weak ? "WEAK" : falling ? "FALLING" : "STABLE";
  return { status, weak, falling, change };
}

const rank: Record<MarksRiskStatus, number> = { CRITICAL: 0, WEAK: 1, FALLING: 2, STABLE: 3, NO_DATA: 4 };

export function compareMarksRisk(
  left: { status: MarksRiskStatus; latestPercentage: number | null; name: string },
  right: { status: MarksRiskStatus; latestPercentage: number | null; name: string },
) {
  return rank[left.status] - rank[right.status] || (left.latestPercentage ?? 101) - (right.latestPercentage ?? 101) || left.name.localeCompare(right.name);
}
