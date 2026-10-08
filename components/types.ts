/**
 * Shapes mirroring the shared HTTP contract in docs/architecture.md and the
 * actual implementations in lib/dashboard.ts and lib/risk.ts.
 *
 * Fields stay optional/tolerant so the UI renders whatever the server returns
 * and never fabricates data.
 */

export type Trend = "up" | "down" | "flat" | "none";
export type RiskLevel = "high" | "warn" | "ok" | "unknown";

export type Professor = {
  email?: string;
  name?: string | null;
};

export type SubjectStat = {
  id: string | number;
  code?: string;
  name?: string;
  department?: string | null;
  attended?: number;
  total?: number;
  attendancePercent?: number | null;
  classesToRecover?: number;
  latestScore?: number | null;
  previousScore?: number | null;
  latestTestName?: string | null;
  trend?: Trend;
  atRisk?: boolean;
  riskLevel?: RiskLevel;
};

export type Student = {
  id: string | number;
  name?: string;
  rollNo?: string;
  email?: string;
  department?: string | null;
  subjects?: SubjectStat[];
  riskLevel?: RiskLevel | string | number | null;
};

export type AdminStats = {
  students?: number;
  subjects?: number;
  atRisk?: number;
  [key: string]: unknown;
};

export type AdminDashboard = {
  role: "admin";
  professor?: Professor;
  stats?: AdminStats;
  students?: Student[];
};

export type StudentDashboard = {
  role: "student";
  student: Student;
  professor?: Professor;
};

export type DashboardResponse = AdminDashboard | StudentDashboard;

export type CalendarSlot = {
  start: string;
  end: string;
  available: boolean;
};

export type SlotsResponse = {
  slots?: CalendarSlot[];
  date?: string;
  timeZone?: string;
  source?: "local";
  calendarConnected?: boolean;
  warning?: string;
  error?: ApiErrorBody;
};

export type Booking = {
  id: string | number;
  start?: string;
  end?: string;
  status?: string;
  eventId?: string;
};

export type BookingResponse = {
  booking?: Booking;
  error?: ApiErrorBody;
};

export type IngestError = {
  row: number | string;
  message: string;
};

export type IngestResult = {
  imported?: number;
  updated?: number;
  errors?: IngestError[];
  error?: ApiErrorBody;
};

/** Errors are `{ error: { code, message, details? } }` per lib/api.ts. */
export type ApiErrorBody = {
  code?: string;
  message?: string;
  details?: unknown;
};
