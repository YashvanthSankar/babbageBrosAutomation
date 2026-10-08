/**
 * CSV parsing for the professor dashboard's Imports tab.
 *
 * The dashboard (`components/UploadsPanel.tsx`) uploads CSV files and expects a
 * one-shot result (`{ imported, updated, errors }`). The workbook parser in
 * `./parser.ts` is the canonical `.xlsx` contract; this module accepts the CSV
 * column layout the UI documents and normalizes it into the same payload types.
 *
 * Roster CSV headers (case-insensitive, spaces/hyphens become underscores):
 *   studentname | rollno | phone | email
 * Attendance CSV: `rollno` followed by date columns (YYYY-MM-DD).
 * Marks CSV: rollno, subject, test_name, test_date, score, max_score
 */
import { z } from 'zod';
import type {
  AttendancePayload,
  KnownStudent,
  MarksPayload,
  ParseResult,
  RosterPayload,
  ValidationItem,
} from './types';
import { parseDate } from './parser';

const MAX_REPORT_ITEMS = 250;
const emailSchema = z.string().email();
const phonePattern = /^\+?[0-9 ()-]{7,24}$/;

function pushItem(target: ValidationItem[], item: ValidationItem) {
  if (target.length < MAX_REPORT_ITEMS) target.push(item);
}

export function normalizeHeader(value: string): string {
  return value.trim().toLowerCase().replace(/[\s-]+/g, '_');
}

/** Minimal RFC-4180-ish CSV parser: quoted fields, escaped quotes, CRLF. */
export function parseCsv(input: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  const text = input.replace(/^\uFEFF/, '');

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (char === '\r') {
      // ignore; handled by the following \n
    } else {
      field += char;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((entry) => entry.some((cell) => cell.trim() !== ''));
}

function indexOfHeader(headers: string[], aliases: string[]): number {
  for (const alias of aliases) {
    const index = headers.indexOf(alias);
    if (index !== -1) return index;
  }
  return -1;
}

const ROLL_ALIASES = ['rollno', 'roll_no', 'roll_number', 'rollnumber', 'roll'];
const NAME_ALIASES = ['studentname', 'student_name', 'name', 'student'];
const EMAIL_ALIASES = ['email', 'email_address'];
const PHONE_ALIASES = ['phone', 'phone_number', 'mobile'];

export function parseRosterCsv(text: string): ParseResult<RosterPayload> {
  const table = parseCsv(text);
  const errors: ValidationItem[] = [];
  const warnings: ValidationItem[] = [];
  if (table.length === 0) {
    return {
      payload: { kind: 'roster', rows: [] },
      report: { errors: [{ code: 'EMPTY_SHEET', message: 'The CSV is empty.' }], warnings, summary: { students: 0 } },
      preview: [],
    };
  }
  const headers = table[0].map(normalizeHeader);
  const rollIndex = indexOfHeader(headers, ROLL_ALIASES);
  const nameIndex = indexOfHeader(headers, NAME_ALIASES);
  const emailIndex = indexOfHeader(headers, EMAIL_ALIASES);
  const phoneIndex = indexOfHeader(headers, PHONE_ALIASES);

  if (rollIndex === -1) {
    pushItem(errors, { row: 1, code: 'INVALID_HEADER', message: 'Add a "rollno" column.' });
  }
  if (nameIndex === -1) {
    pushItem(errors, { row: 1, code: 'INVALID_HEADER', message: 'Add a "studentname" column.' });
  }
  if (emailIndex === -1) {
    pushItem(errors, { row: 1, code: 'INVALID_HEADER', message: 'Add an "email" column.' });
  }

  const rows: RosterPayload['rows'] = [];
  const seen = new Set<string>();
  for (let r = 1; r < table.length; r += 1) {
    const cells = table[r];
    const rowNumber = r + 1;
    const rollNumber = (rollIndex >= 0 ? cells[rollIndex] ?? '' : '').trim();
    const name = (nameIndex >= 0 ? cells[nameIndex] ?? '' : '').trim();
    const email = (emailIndex >= 0 ? cells[emailIndex] ?? '' : '').trim().toLowerCase();
    const phone = (phoneIndex >= 0 ? cells[phoneIndex] ?? '' : '').trim();

    if (!rollNumber) {
      pushItem(errors, { row: rowNumber, column: 'A', code: 'REQUIRED', message: 'Roll number is required.' });
    }
    if (!name) {
      pushItem(errors, { row: rowNumber, column: 'B', code: 'REQUIRED', message: 'Name is required.' });
    }
    if (!emailSchema.safeParse(email).success) {
      pushItem(errors, { row: rowNumber, column: 'C', code: 'INVALID_EMAIL', message: 'Enter a valid email address.' });
    }
    if (phone && !phonePattern.test(phone)) {
      pushItem(errors, { row: rowNumber, column: 'D', code: 'INVALID_PHONE', message: 'Enter a valid phone number.' });
    }
    const normalizedRoll = rollNumber.toLowerCase();
    if (rollNumber && seen.has(normalizedRoll)) {
      pushItem(errors, {
        row: rowNumber,
        column: 'A',
        code: 'DUPLICATE_ROLL',
        message: `Roll number ${rollNumber} appears more than once.`,
      });
    }
    seen.add(normalizedRoll);
    rows.push({ rollNumber, name, email, phone });
  }

  if (!rows.length) {
    pushItem(errors, { code: 'EMPTY_SHEET', message: 'The roster does not contain any students.' });
  }
  return {
    payload: { kind: 'roster', rows },
    report: { errors, warnings, summary: { students: rows.length } },
    preview: rows.slice(0, 8),
  };
}

function normalizeStatus(raw: string): 'P' | 'A' | null {
  const value = raw.trim().toLowerCase();
  if (value === 'p' || value === 'present' || value === '1' || value === 'true' || value === 'y' || value === 'yes') {
    return 'P';
  }
  if (value === 'a' || value === 'absent' || value === '0' || value === 'false' || value === 'n' || value === 'no') {
    return 'A';
  }
  return null;
}

export function parseAttendanceCsv(
  text: string,
  subjectId: string,
  knownStudents: KnownStudent[],
): ParseResult<AttendancePayload> {
  const table = parseCsv(text);
  const errors: ValidationItem[] = [];
  const warnings: ValidationItem[] = [];
  const empty: ParseResult<AttendancePayload> = {
    payload: { kind: 'attendance', subjectId, entries: [] },
    report: { errors: [{ code: 'EMPTY_SHEET', message: 'The CSV is empty.' }], warnings, summary: {} },
    preview: [],
  };
  if (table.length === 0) return empty;

  const headers = table[0].map(normalizeHeader);
  const rollIndex = indexOfHeader(headers, ROLL_ALIASES);
  if (rollIndex === -1) {
    pushItem(errors, { row: 1, column: 'A', code: 'INVALID_HEADER', message: 'Expected a "rollno" column in column A.' });
  }

  const dates: Array<{ column: number; date: string }> = [];
  const seenDates = new Set<string>();
  for (let column = 0; column < headers.length; column += 1) {
    if (column === rollIndex) continue;
    const date = parseDate(table[0][column]);
    if (!date) {
      pushItem(errors, { row: 1, column: columnLetter(column), code: 'INVALID_DATE', message: 'Use an Excel date or YYYY-MM-DD.' });
      continue;
    }
    if (seenDates.has(date)) {
      pushItem(errors, { row: 1, column: columnLetter(column), code: 'DUPLICATE_DATE', message: `${date} appears more than once.` });
      continue;
    }
    seenDates.add(date);
    dates.push({ column, date });
  }
  if (!dates.length) {
    pushItem(errors, { row: 1, code: 'NO_DATES', message: 'Add at least one attendance date column.' });
  }

  const studentMap = new Map(knownStudents.map((student) => [student.rollNumber.toLowerCase(), student]));
  const seenRolls = new Set<string>();
  const entries: AttendancePayload['entries'] = [];
  let blankCells = 0;
  let studentRows = 0;

  for (let r = 1; r < table.length; r += 1) {
    const cells = table[r];
    const rowNumber = r + 1;
    const rollNumber = (rollIndex >= 0 ? cells[rollIndex] ?? '' : '').trim();
    const hasValues = dates.some(({ column }) => (cells[column] ?? '').trim() !== '');
    if (!rollNumber && !hasValues) continue;
    studentRows += 1;
    if (!rollNumber) {
      pushItem(errors, { row: rowNumber, column: 'A', code: 'REQUIRED', message: 'Roll number is required.' });
      continue;
    }
    const normalizedRoll = rollNumber.toLowerCase();
    const student = studentMap.get(normalizedRoll);
    if (!student) {
      pushItem(errors, { row: rowNumber, column: 'A', code: 'UNKNOWN_STUDENT', message: `No student matches roll number ${rollNumber}.` });
    } else if (!student.active) {
      pushItem(warnings, { row: rowNumber, column: 'A', code: 'INACTIVE_STUDENT', message: `${rollNumber} is inactive; records will still be imported.` });
    }
    if (seenRolls.has(normalizedRoll)) {
      pushItem(errors, { row: rowNumber, column: 'A', code: 'DUPLICATE_ROLL', message: `Roll number ${rollNumber} appears more than once.` });
    }
    seenRolls.add(normalizedRoll);

    for (const { column, date } of dates) {
      const raw = (cells[column] ?? '').trim();
      if (!raw) {
        blankCells += 1;
        continue;
      }
      const status = normalizeStatus(raw);
      if (!status) {
        pushItem(errors, { row: rowNumber, column: columnLetter(column), code: 'INVALID_STATUS', message: `Expected A or P, received "${raw}".` });
        continue;
      }
      if (student) entries.push({ rollNumber: student.rollNumber, date, status });
    }
  }

  if (blankCells) {
    pushItem(warnings, { code: 'BLANK_CELLS', message: `${blankCells} blank attendance cell${blankCells === 1 ? ' was' : 's were'} skipped.` });
  }
  if (!studentRows) {
    pushItem(errors, { code: 'EMPTY_SHEET', message: 'The sheet does not contain any student rows.' });
  }
  return {
    payload: { kind: 'attendance', subjectId, entries },
    report: { errors, warnings, summary: { studentRows, dates: dates.length, records: entries.length, blankCells } },
    preview: entries.slice(0, 10),
  };
}

export function parseMarksCsv(text: string, subjectId: string | null): ParseResult<MarksPayload> {
  const table = parseCsv(text);
  const errors: ValidationItem[] = [];
  const warnings: ValidationItem[] = [];
  const empty: ParseResult<MarksPayload> = {
    payload: { kind: 'marks', subjectId, entries: [] },
    report: { errors: [{ code: 'EMPTY_SHEET', message: 'The CSV is empty.' }], warnings, summary: {} },
    preview: [],
  };
  if (table.length === 0) return empty;

  const headers = table[0].map(normalizeHeader);
  const rollIndex = indexOfHeader(headers, ROLL_ALIASES);
  const subjectIndex = indexOfHeader(headers, ['subject', 'subject_code', 'subject_name']);
  const testNameIndex = indexOfHeader(headers, ['test_name', 'test', 'assessment']);
  const testDateIndex = indexOfHeader(headers, ['test_date', 'date']);
  const scoreIndex = indexOfHeader(headers, ['score', 'marks', 'obtained']);
  const maxScoreIndex = indexOfHeader(headers, ['max_score', 'maxscore', 'maximum', 'out_of']);

  const required: Array<[number, string]> = [
    [rollIndex, 'rollno'],
    [testNameIndex, 'test_name'],
    [testDateIndex, 'test_date'],
    [scoreIndex, 'score'],
    [maxScoreIndex, 'max_score'],
  ];
  for (const [index, name] of required) {
    if (index === -1) pushItem(errors, { row: 1, code: 'INVALID_HEADER', message: `Add a "${name}" column.` });
  }
  if (!subjectId && subjectIndex === -1) {
    pushItem(errors, { row: 1, code: 'INVALID_HEADER', message: 'Add a "subject" column or select a subject.' });
  }

  const entries: MarksPayload['entries'] = [];
  for (let r = 1; r < table.length; r += 1) {
    const cells = table[r];
    const rowNumber = r + 1;
    const rollNumber = (rollIndex >= 0 ? cells[rollIndex] ?? '' : '').trim();
    const subjectRef = (subjectIndex >= 0 ? cells[subjectIndex] ?? '' : '').trim();
    const testName = (testNameIndex >= 0 ? cells[testNameIndex] ?? '' : '').trim();
    const testDate = parseDate(testDateIndex >= 0 ? cells[testDateIndex] : '');
    const score = Number((scoreIndex >= 0 ? cells[scoreIndex] ?? '' : '').trim());
    const maxScore = Number((maxScoreIndex >= 0 ? cells[maxScoreIndex] ?? '' : '').trim());

    if (!rollNumber) pushItem(errors, { row: rowNumber, column: 'A', code: 'REQUIRED', message: 'Roll number is required.' });
    if (!testName) pushItem(errors, { row: rowNumber, code: 'REQUIRED', message: 'Test name is required.' });
    if (!testDate) pushItem(errors, { row: rowNumber, code: 'INVALID_DATE', message: 'Test date must be YYYY-MM-DD.' });
    if (!Number.isFinite(score)) pushItem(errors, { row: rowNumber, code: 'INVALID_SCORE', message: 'Score must be a number.' });
    if (!Number.isFinite(maxScore) || maxScore <= 0) {
      pushItem(errors, { row: rowNumber, code: 'INVALID_MAX_SCORE', message: 'Max score must be greater than zero.' });
    }
    if (rollNumber && testName && testDate && Number.isFinite(score) && Number.isFinite(maxScore) && maxScore > 0) {
      entries.push({ rollNumber, subjectRef, testName, testDate, score, maxScore });
    }
  }

  if (!entries.length && errors.length === 0) {
    pushItem(errors, { code: 'EMPTY_SHEET', message: 'The marks file does not contain any rows.' });
  }
  return {
    payload: { kind: 'marks', subjectId, entries },
    report: { errors, warnings, summary: { records: entries.length } },
    preview: entries.slice(0, 10),
  };
}

function columnLetter(index: number): string {
  let n = index;
  let letters = '';
  do {
    letters = String.fromCharCode(65 + (n % 26)) + letters;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return letters;
}
