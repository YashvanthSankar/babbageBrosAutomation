import ExcelJS from "exceljs";
import { z } from "zod";
import type {
  AttendancePayload,
  KnownStudent,
  ParseResult,
  RosterPayload,
  RosterRow,
  MarksPayload,
  ValidationItem,
} from "./types";

const MAX_ROWS = 500;
const MAX_DATE_COLUMNS = 370;
const MAX_ATTENDANCE_RECORDS = 2_000;
const MAX_REPORT_ITEMS = 250;
const rosterHeaders = ["roll_number", "name", "email", "phone"] as const;
const emailSchema = z.string().email();
const phonePattern = /^\+?[0-9 ()-]{7,24}$/;

function pushItem(target: ValidationItem[], item: ValidationItem) {
  if (target.length < MAX_REPORT_ITEMS) target.push(item);
}

function text(value: unknown) {
  if (value === null || value === undefined) return "";
  if (typeof value === "object" && "result" in value) {
    return text((value as { result?: unknown }).result);
  }
  if (typeof value === "object" && "text" in value) {
    return String((value as { text?: unknown }).text ?? "").trim();
  }
  return String(value).trim();
}

function normalizeHeader(value: unknown) {
  return text(value).toLowerCase().replace(/[\s-]+/g, "_");
}

function isoDate(year: number, month: number, day: number) {
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}-${day
    .toString()
    .padStart(2, "0")}`;
}

function parseDate(value: unknown) {
  if (value instanceof Date && !Number.isNaN(value.valueOf())) {
    return isoDate(value.getUTCFullYear(), value.getUTCMonth() + 1, value.getUTCDate());
  }
  if (typeof value === "number") {
    const excelEpoch = Date.UTC(1899, 11, 30);
    const date = new Date(excelEpoch + Math.floor(value) * 86_400_000);
    return isoDate(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
  }
  const valueText = text(value);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valueText);
  return match ? isoDate(Number(match[1]), Number(match[2]), Number(match[3])) : null;
}

async function firstWorksheet(buffer: Buffer) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);
  const worksheet = workbook.worksheets[0];
  if (!worksheet) throw new Error("The workbook does not contain a worksheet.");
  if (worksheet.rowCount > MAX_ROWS + 1) {
    throw new Error(`The workbook exceeds the ${MAX_ROWS.toLocaleString()} row limit.`);
  }
  return worksheet;
}

export async function parseRosterWorkbook(buffer: Buffer): Promise<ParseResult<RosterPayload>> {
  const worksheet = await firstWorksheet(buffer);
  const errors: ValidationItem[] = [];
  const warnings: ValidationItem[] = [];
  const headerRow = worksheet.getRow(1);
  const headers = rosterHeaders.map((_, index) => normalizeHeader(headerRow.getCell(index + 1).value));

  rosterHeaders.forEach((required, index) => {
    if (headers[index] !== required) {
      pushItem(errors, {
        row: 1,
        column: String.fromCharCode(65 + index),
        code: "INVALID_HEADER",
        message: `Expected \"${required}\" in column ${String.fromCharCode(65 + index)}.`,
      });
    }
  });

  const rows: RosterRow[] = [];
  const seen = new Set<string>();
  for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    const values = [1, 2, 3, 4].map((column) => text(row.getCell(column).value));
    if (values.every((value) => !value)) continue;
    const [rollNumber, name, email, phone] = values;

    if (!rollNumber) pushItem(errors, { row: rowNumber, column: "A", code: "REQUIRED", message: "Roll number is required." });
    if (!name) pushItem(errors, { row: rowNumber, column: "B", code: "REQUIRED", message: "Name is required." });
    if (!emailSchema.safeParse(email).success) {
      pushItem(errors, { row: rowNumber, column: "C", code: "INVALID_EMAIL", message: "Enter a valid email address." });
    }
    if (!phonePattern.test(phone)) {
      pushItem(errors, { row: rowNumber, column: "D", code: "INVALID_PHONE", message: "Enter a valid phone number." });
    }
    const normalizedRoll = rollNumber.toLowerCase();
    if (rollNumber && seen.has(normalizedRoll)) {
      pushItem(errors, { row: rowNumber, column: "A", code: "DUPLICATE_ROLL", message: `Roll number ${rollNumber} appears more than once.` });
    }
    seen.add(normalizedRoll);
    rows.push({ rollNumber, name, email: email.toLowerCase(), phone });
  }

  if (!rows.length) pushItem(errors, { code: "EMPTY_SHEET", message: "The roster does not contain any students." });
  return {
    payload: { kind: "roster", rows },
    report: { errors, warnings, summary: { students: rows.length } },
    preview: rows.slice(0, 8),
  };
}

export async function parseAttendanceWorkbook(
  buffer: Buffer,
  subjectId: string,
  knownStudents: KnownStudent[],
): Promise<ParseResult<AttendancePayload>> {
  const worksheet = await firstWorksheet(buffer);
  const errors: ValidationItem[] = [];
  const warnings: ValidationItem[] = [];
  const firstHeader = normalizeHeader(worksheet.getRow(1).getCell(1).value);
  if (firstHeader !== "roll_number") {
    pushItem(errors, { row: 1, column: "A", code: "INVALID_HEADER", message: 'Expected "roll_number" in column A.' });
  }
  if (worksheet.columnCount - 1 > MAX_DATE_COLUMNS) {
    pushItem(errors, { code: "TOO_MANY_DATES", message: `A workbook may contain at most ${MAX_DATE_COLUMNS} date columns.` });
  }

  const dates: Array<{ column: number; date: string }> = [];
  const seenDates = new Set<string>();
  for (let column = 2; column <= worksheet.columnCount; column += 1) {
    const date = parseDate(worksheet.getRow(1).getCell(column).value);
    const letter = worksheet.getColumn(column).letter;
    if (!date) {
      pushItem(errors, { row: 1, column: letter, code: "INVALID_DATE", message: "Use an Excel date or YYYY-MM-DD." });
      continue;
    }
    if (seenDates.has(date)) {
      pushItem(errors, { row: 1, column: letter, code: "DUPLICATE_DATE", message: `${date} appears more than once.` });
      continue;
    }
    seenDates.add(date);
    dates.push({ column, date });
  }
  if (!dates.length) pushItem(errors, { row: 1, code: "NO_DATES", message: "Add at least one attendance date column." });

  const studentMap = new Map(knownStudents.map((student) => [student.rollNumber.toLowerCase(), student]));
  const seenRolls = new Set<string>();
  const entries: AttendancePayload["entries"] = [];
  let blankCells = 0;
  let studentRows = 0;

  for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    const rollNumber = text(row.getCell(1).value);
    const hasValues = dates.some(({ column }) => text(row.getCell(column).value));
    if (!rollNumber && !hasValues) continue;
    studentRows += 1;
    if (!rollNumber) {
      pushItem(errors, { row: rowNumber, column: "A", code: "REQUIRED", message: "Roll number is required." });
      continue;
    }
    const normalizedRoll = rollNumber.toLowerCase();
    const student = studentMap.get(normalizedRoll);
    if (!student) {
      pushItem(errors, { row: rowNumber, column: "A", code: "UNKNOWN_STUDENT", message: `No student matches roll number ${rollNumber}.` });
    } else if (!student.active) {
      pushItem(warnings, { row: rowNumber, column: "A", code: "INACTIVE_STUDENT", message: `${rollNumber} is inactive; records will still be imported.` });
    }
    if (seenRolls.has(normalizedRoll)) {
      pushItem(errors, { row: rowNumber, column: "A", code: "DUPLICATE_ROLL", message: `Roll number ${rollNumber} appears more than once.` });
    }
    seenRolls.add(normalizedRoll);

    for (const { column, date } of dates) {
      const rawStatus = text(row.getCell(column).value);
      if (!rawStatus) {
        blankCells += 1;
        continue;
      }
      const status = rawStatus.toUpperCase();
      if (status !== "A" && status !== "P") {
        pushItem(errors, {
          row: rowNumber,
          column: worksheet.getColumn(column).letter,
          code: "INVALID_STATUS",
          message: `Expected A or P, received \"${rawStatus}\".`,
        });
        continue;
      }
      if (student) entries.push({ rollNumber: student.rollNumber, date, status });
    }
  }

  if (blankCells) {
    pushItem(warnings, { code: "BLANK_CELLS", message: `${blankCells} blank attendance cell${blankCells === 1 ? " was" : "s were"} skipped.` });
  }
  if (entries.length > MAX_ATTENDANCE_RECORDS) {
    pushItem(errors, { code: "TOO_MANY_RECORDS", message: `One upload may contain at most ${MAX_ATTENDANCE_RECORDS.toLocaleString()} non-blank attendance records.` });
  }
  if (!studentRows) pushItem(errors, { code: "EMPTY_SHEET", message: "The sheet does not contain any student rows." });
  return {
    payload: { kind: "attendance", subjectId, entries },
    report: { errors, warnings, summary: { studentRows, dates: dates.length, records: entries.length, blankCells } },
    preview: entries.slice(0, 10),
  };
}

export async function parseMarksWorkbook(
  buffer: Buffer,
  metadata: { subjectId: string; assessmentName: string; assessmentDate: string; maxMarks: number },
  knownStudents: KnownStudent[],
): Promise<ParseResult<MarksPayload>> {
  const worksheet = await firstWorksheet(buffer);
  const errors: ValidationItem[] = [];
  const warnings: ValidationItem[] = [];
  const first = normalizeHeader(worksheet.getRow(1).getCell(1).value);
  const second = normalizeHeader(worksheet.getRow(1).getCell(2).value);
  if (first !== "roll_number") pushItem(errors, { row: 1, column: "A", code: "INVALID_HEADER", message: 'Expected "roll_number" in column A.' });
  if (second !== "marks_obtained") pushItem(errors, { row: 1, column: "B", code: "INVALID_HEADER", message: 'Expected "marks_obtained" in column B.' });

  const studentMap = new Map(knownStudents.map((student) => [student.rollNumber.toLowerCase(), student]));
  const seenRolls = new Set<string>();
  const rows: MarksPayload["rows"] = [];
  let blankMarks = 0;
  for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    const rollNumber = text(row.getCell(1).value);
    const rawMark = row.getCell(2).value;
    if (!rollNumber && !text(rawMark)) continue;
    if (!rollNumber) {
      pushItem(errors, { row: rowNumber, column: "A", code: "REQUIRED", message: "Roll number is required." });
      continue;
    }
    const normalizedRoll = rollNumber.toLowerCase();
    const student = studentMap.get(normalizedRoll);
    if (!student) pushItem(errors, { row: rowNumber, column: "A", code: "UNKNOWN_STUDENT", message: `No student matches roll number ${rollNumber}.` });
    else if (!student.active) pushItem(warnings, { row: rowNumber, column: "A", code: "INACTIVE_STUDENT", message: `${rollNumber} is inactive; marks will still be imported.` });
    if (seenRolls.has(normalizedRoll)) pushItem(errors, { row: rowNumber, column: "A", code: "DUPLICATE_ROLL", message: `Roll number ${rollNumber} appears more than once.` });
    seenRolls.add(normalizedRoll);
    if (rawMark === null || rawMark === undefined || text(rawMark) === "") {
      blankMarks += 1;
      continue;
    }
    const marksObtained = typeof rawMark === "number" ? rawMark : Number(text(rawMark));
    if (!Number.isFinite(marksObtained) || marksObtained < 0 || marksObtained > metadata.maxMarks) {
      pushItem(errors, { row: rowNumber, column: "B", code: "INVALID_MARKS", message: `Marks must be between 0 and ${metadata.maxMarks}.` });
      continue;
    }
    if (student) rows.push({ rollNumber: student.rollNumber, marksObtained });
  }
  if (blankMarks) pushItem(warnings, { code: "BLANK_MARKS", message: `${blankMarks} blank mark${blankMarks === 1 ? " was" : "s were"} skipped.` });
  if (!rows.length) pushItem(errors, { code: "EMPTY_SHEET", message: "The sheet does not contain any valid mark rows." });
  return {
    payload: { kind: "marks", ...metadata, rows },
    report: { errors, warnings, summary: { students: rows.length, blankMarks } },
    preview: rows.slice(0, 10).map((row) => ({ ...row, percentage: Math.round((row.marksObtained / metadata.maxMarks) * 1000) / 10 })),
  };
}
