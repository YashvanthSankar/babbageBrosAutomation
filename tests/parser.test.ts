import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { parseAttendanceWorkbook, parseMarksWorkbook, parseRosterWorkbook } from "@/lib/imports/parser";

async function workbookBuffer(rows: unknown[][]) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Sheet 1");
  rows.forEach((row) => sheet.addRow(row));
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

describe("roster parser", () => {
  it("normalizes a valid roster", async () => {
    const buffer = await workbookBuffer([
      ["roll_number", "name", "email", "phone"],
      ["CS001", "Asha Rao", "ASHA@EXAMPLE.COM", "+91 98765 43210"],
    ]);
    const result = await parseRosterWorkbook(buffer);
    expect(result.report.errors).toEqual([]);
    expect(result.payload.rows[0]).toEqual({ rollNumber: "CS001", name: "Asha Rao", email: "asha@example.com", phone: "+91 98765 43210" });
  });

  it("reports duplicate rolls and malformed contacts", async () => {
    const buffer = await workbookBuffer([
      ["roll_number", "name", "email", "phone"],
      ["CS001", "Asha Rao", "bad-email", "x"],
      ["cs001", "Other Student", "other@example.com", "+91 90000 00000"],
    ]);
    const result = await parseRosterWorkbook(buffer);
    expect(result.report.errors.map((error) => error.code)).toEqual(expect.arrayContaining(["INVALID_EMAIL", "INVALID_PHONE", "DUPLICATE_ROLL"]));
  });
});

describe("marks parser", () => {
  const known = [{ id: "student-1", rollNumber: "CS001", active: true }];

  it("normalizes valid marks and calculates preview percentages", async () => {
    const buffer = await workbookBuffer([["roll_number", "marks_obtained"], ["CS001", 42]]);
    const result = await parseMarksWorkbook(buffer, { subjectId: "subject-1", assessmentName: "Quiz 1", assessmentDate: "2026-10-08", maxMarks: 50 }, known);
    expect(result.report.errors).toEqual([]);
    expect(result.payload.rows).toEqual([{ rollNumber: "CS001", marksObtained: 42 }]);
    expect(result.preview[0].percentage).toBe(84);
  });

  it("rejects marks above the maximum and unknown students", async () => {
    const buffer = await workbookBuffer([["roll_number", "marks_obtained"], ["UNKNOWN", 51]]);
    const result = await parseMarksWorkbook(buffer, { subjectId: "subject-1", assessmentName: "Quiz 1", assessmentDate: "2026-10-08", maxMarks: 50 }, known);
    expect(result.report.errors.map((error) => error.code)).toEqual(expect.arrayContaining(["UNKNOWN_STUDENT", "INVALID_MARKS"]));
  });
});

describe("attendance parser", () => {
  const known = [
    { id: "student-1", rollNumber: "CS001", active: true },
    { id: "student-2", rollNumber: "CS002", active: true },
  ];

  it("normalizes statuses and skips blank cells", async () => {
    const buffer = await workbookBuffer([
      ["roll_number", "2026-10-01", "2026-10-02"],
      ["CS001", "p", ""],
      ["CS002", "A", "P"],
    ]);
    const result = await parseAttendanceWorkbook(buffer, "00000000-0000-4000-8000-000000000001", known);
    expect(result.report.errors).toEqual([]);
    expect(result.report.summary).toMatchObject({ studentRows: 2, dates: 2, records: 3, blankCells: 1 });
    expect(result.payload.entries.map((entry) => entry.status)).toEqual(["P", "A", "P"]);
    expect(result.report.warnings[0].code).toBe("BLANK_CELLS");
  });

  it("blocks duplicate dates, unknown students, and invalid values", async () => {
    const buffer = await workbookBuffer([
      ["roll_number", "2026-10-01", "2026-10-01"],
      ["UNKNOWN", "P", "late"],
    ]);
    const result = await parseAttendanceWorkbook(buffer, "00000000-0000-4000-8000-000000000001", known);
    expect(result.report.errors.map((error) => error.code)).toEqual(expect.arrayContaining(["DUPLICATE_DATE", "UNKNOWN_STUDENT"]));
  });
});
