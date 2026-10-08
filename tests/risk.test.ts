import { describe, expect, it } from "vitest";
import { attendancePercentage, compareRisk, recoveryClasses, riskStatus } from "@/lib/risk";

describe("attendance risk calculations", () => {
  it("returns no percentage when nothing has been recorded", () => {
    expect(attendancePercentage(0, 0)).toBeNull();
    expect(riskStatus(null, 85)).toBe("NO_DATA");
    expect(recoveryClasses(0, 0, 85)).toBe(0);
  });

  it("treats the exact threshold as watch rather than at risk", () => {
    expect(attendancePercentage(17, 20)).toBe(85);
    expect(riskStatus(85, 85)).toBe("WATCH");
    expect(recoveryClasses(17, 20, 85)).toBe(0);
  });

  it("calculates the minimum consecutive classes needed to recover", () => {
    expect(recoveryClasses(8, 10, 85)).toBe(4);
    expect((8 + 4) / (10 + 4)).toBeGreaterThanOrEqual(0.85);
    expect((8 + 3) / (10 + 3)).toBeLessThan(0.85);
  });

  it("uses the configured subject threshold", () => {
    expect(riskStatus(79.9, 80)).toBe("AT_RISK");
    expect(riskStatus(82, 80)).toBe("WATCH");
    expect(riskStatus(85, 80)).toBe("SAFE");
  });

  it("orders at-risk students before safer students", () => {
    const rows = [
      { name: "Safe", status: "SAFE" as const, percentage: 96, recoveryClasses: 0 },
      { name: "Borderline", status: "AT_RISK" as const, percentage: 84, recoveryClasses: 1 },
      { name: "Critical", status: "AT_RISK" as const, percentage: 60, recoveryClasses: 17 },
    ];
    expect(rows.sort(compareRisk).map((row) => row.name)).toEqual(["Critical", "Borderline", "Safe"]);
  });
});
