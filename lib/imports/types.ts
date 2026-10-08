/**
 * Ingestion payload and validation types.
 *
 * Ported from the `upload` branch and adapted to this repository's canonical
 * PostgreSQL schema (see db/schema.sql). IDs are integer serials here, not
 * UUIDs, and validation types are defined locally so the parser has no
 * dependency on any ORM.
 */

export type ValidationItem = {
  row?: number;
  column?: string;
  code: string;
  message: string;
};

export type ValidationReport = {
  errors: ValidationItem[];
  warnings: ValidationItem[];
  summary: Record<string, number>;
};

export type RosterRow = {
  rollNumber: string;
  name: string;
  email: string;
  phone: string;
};

export type AttendanceEntry = {
  rollNumber: string;
  date: string;
  status: 'P' | 'A';
};

export type MarksEntry = {
  rollNumber: string;
  subjectRef: string;
  testName: string;
  testDate: string;
  score: number;
  maxScore: number;
};

export type RosterPayload = { kind: 'roster'; rows: RosterRow[] };
export type AttendancePayload = {
  kind: 'attendance';
  subjectId: string;
  entries: AttendanceEntry[];
};
export type MarksPayload = {
  kind: 'marks';
  subjectId: string | null;
  entries: MarksEntry[];
};

export type ImportPayload = RosterPayload | AttendancePayload | MarksPayload;

export type ParseResult<T> = {
  payload: T;
  report: ValidationReport;
  preview: Record<string, unknown>[];
};

export type KnownStudent = { id: string; rollNumber: string; active: boolean };
