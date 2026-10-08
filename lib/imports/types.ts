import type { ValidationReport } from "@/lib/db/schema";

export type RosterRow = {
  rollNumber: string;
  name: string;
  email: string;
  phone: string;
};

export type AttendanceEntry = {
  rollNumber: string;
  date: string;
  status: "P" | "A";
};

export type RosterPayload = { kind: "roster"; rows: RosterRow[] };
export type AttendancePayload = {
  kind: "attendance";
  subjectId: string;
  entries: AttendanceEntry[];
};

export type ParseResult<T> = {
  payload: T;
  report: ValidationReport;
  preview: Record<string, unknown>[];
};

export type KnownStudent = { id: string; rollNumber: string; active: boolean };
