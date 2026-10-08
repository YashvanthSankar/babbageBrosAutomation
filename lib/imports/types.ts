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
  status: "P" | "A";
};

export type RosterPayload = { kind: "roster"; rows: RosterRow[] };
export type AttendancePayload = {
  kind: "attendance";
  subjectId: string;
  entries: AttendanceEntry[];
};

export type MarksRow = { rollNumber: string; marksObtained: number };
export type MarksPayload = {
  kind: "marks";
  subjectId: string;
  assessmentName: string;
  assessmentDate: string;
  maxMarks: number;
  rows: MarksRow[];
};

export type ParseResult<T> = {
  payload: T;
  report: ValidationReport;
  preview: Record<string, unknown>[];
};

export type KnownStudent = { id: string; rollNumber: string; active: boolean };
