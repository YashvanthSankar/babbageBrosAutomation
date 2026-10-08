import { describe, expect, it } from "vitest";
import { compareMarksRisk, marksRisk } from "@/lib/marks-risk";

describe("marks risk", () => {
  it("flags a weak latest score", () => expect(marksRisk(49, null, 50)).toMatchObject({ status: "WEAK", weak: true, falling: false }));
  it("flags a ten-point fall", () => expect(marksRisk(70, 80, 50)).toMatchObject({ status: "FALLING", weak: false, falling: true, change: -10 }));
  it("marks weak and falling as critical", () => expect(marksRisk(40, 60, 50).status).toBe("CRITICAL"));
  it("does not infer a trend from one score", () => expect(marksRisk(75, null, 50).status).toBe("STABLE"));
  it("orders critical students first", () => {
    const rows = [
      { name: "Stable", status: "STABLE" as const, latestPercentage: 80 },
      { name: "Critical", status: "CRITICAL" as const, latestPercentage: 30 },
      { name: "Weak", status: "WEAK" as const, latestPercentage: 45 },
    ];
    expect(rows.sort(compareMarksRisk).map((row) => row.name)).toEqual(["Critical", "Weak", "Stable"]);
  });
});
