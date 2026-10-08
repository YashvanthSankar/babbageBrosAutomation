/**
 * Role-scoped dashboard assembly.
 *
 * Admin  -> every student of the professor, with per-subject attendance risk,
 *           latest/previous comparable marks and a trend.
 * Student -> only their own record (matched by the authenticated session email).
 * Phone numbers are never included in a dashboard response.
 */
import { query } from './db';
import { getProfessorEmail, normalizeEmail } from './env';
import {
  computeSubjectRisk,
  overallRisk,
  type RiskLevel,
  type SubjectRisk,
  type TestInput,
  type Trend,
} from './risk';
import {
  listStudentsForProfessor,
  listSubjectsForProfessor,
  type StudentRow,
  type SubjectRow,
} from './roster';

export interface DashboardSubject {
  id: number;
  code: string;
  name: string;
  attended: number;
  total: number;
  attendancePercent: number | null;
  classesToRecover: number;
  latestScore: number | null;
  previousScore: number | null;
  latestTestName: string | null;
  trend: Trend;
  atRisk: boolean;
}

export interface DashboardStudent {
  id: number;
  name: string;
  rollNo: string;
  email: string;
  department: string | null;
  subjects: DashboardSubject[];
  riskLevel: RiskLevel;
}

export interface DashboardProfessor {
  email: string;
  name: string | null;
}

export interface AdminDashboard {
  role: 'admin';
  professor: DashboardProfessor;
  stats: { students: number; subjects: number; atRisk: number };
  students: DashboardStudent[];
}

export interface StudentDashboard {
  role: 'student';
  professor: DashboardProfessor;
  student: DashboardStudent;
}

interface AttendanceAggregate {
  attended: number;
  total: number;
}

type AggregateMap = Map<string, AttendanceAggregate>;
type TestMap = Map<string, TestInput[]>;

function key(studentId: number, subjectId: number): string {
  return `${studentId}:${subjectId}`;
}

async function loadAggregates(
  subjects: readonly SubjectRow[],
): Promise<{ attendance: AggregateMap; tests: TestMap }> {
  const attendance: AggregateMap = new Map();
  const tests: TestMap = new Map();
  const subjectIds = subjects.map((s) => s.id);
  if (subjectIds.length === 0) return { attendance, tests };

  const attendanceRows = await query<{
    student_id: number;
    subject_id: number;
    total: number;
    attended: number;
  }>(
    `SELECT student_id,
            subject_id,
            COUNT(*)::int AS total,
            COUNT(*) FILTER (WHERE present)::int AS attended
       FROM attendance_records
      WHERE subject_id = ANY($1::int[])
      GROUP BY student_id, subject_id`,
    [subjectIds],
  );
  for (const row of attendanceRows.rows) {
    attendance.set(key(row.student_id, row.subject_id), {
      attended: Number(row.attended),
      total: Number(row.total),
    });
  }

  const testRows = await query<{
    student_id: number;
    subject_id: number;
    test_name: string;
    test_date: string;
    score: number;
    max_score: number;
  }>(
    `SELECT student_id,
            subject_id,
            test_name,
            test_date::text AS test_date,
            score::float8 AS score,
            max_score::float8 AS max_score
       FROM test_results
      WHERE subject_id = ANY($1::int[])
      ORDER BY test_date ASC, id ASC`,
    [subjectIds],
  );
  for (const row of testRows.rows) {
    const entry = tests.get(key(row.student_id, row.subject_id)) ?? [];
    entry.push({
      name: row.test_name,
      date: row.test_date,
      score: Number(row.score),
      maxScore: Number(row.max_score),
    });
    tests.set(key(row.student_id, row.subject_id), entry);
  }

  return { attendance, tests };
}

function departmentForSubjects(subjects: readonly SubjectRow[]): string | null {
  return subjects.find((s) => Boolean(s.department))?.department ?? null;
}

function buildStudent(
  student: StudentRow,
  subjects: readonly SubjectRow[],
  attendance: AggregateMap,
  tests: TestMap,
): DashboardStudent {
  const subjectRisks: SubjectRisk[] = subjects.map((subject) => {
    const aggregate = attendance.get(key(student.id, subject.id)) ?? { attended: 0, total: 0 };
    const subjectTests = tests.get(key(student.id, subject.id)) ?? [];
    return computeSubjectRisk({
      id: subject.id,
      code: subject.code,
      name: subject.name,
      attended: aggregate.attended,
      total: aggregate.total,
      tests: subjectTests,
    });
  });

  return {
    id: student.id,
    name: student.name,
    rollNo: student.roll_no,
    email: student.email,
    department: departmentForSubjects(subjects),
    subjects: subjectRisks.map((r) => ({
      id: r.id,
      code: r.code,
      name: r.name,
      attended: r.attended,
      total: r.total,
      attendancePercent: r.attendancePercent,
      classesToRecover: r.classesToRecover,
      latestScore: r.latestScore,
      previousScore: r.previousScore,
      latestTestName: r.latestTestName,
      trend: r.trend,
      atRisk: r.atRisk,
    })),
    riskLevel: overallRisk(subjectRisks.map((r) => r.riskLevel)),
  };
}

function professorFor(email: string): DashboardProfessor {
  return { email: normalizeEmail(email), name: null };
}

export async function getAdminDashboard(professorEmail: string): Promise<AdminDashboard> {
  const email = normalizeEmail(professorEmail || getProfessorEmail());
  const [students, subjects] = await Promise.all([
    listStudentsForProfessor(email),
    listSubjectsForProfessor(email),
  ]);
  const { attendance, tests } = await loadAggregates(subjects);

  const built = students.map((student) => buildStudent(student, subjects, attendance, tests));

  return {
    role: 'admin',
    professor: professorFor(email),
    stats: {
      students: built.length,
      subjects: subjects.length,
      atRisk: built.filter((s) => s.riskLevel === 'high' || s.riskLevel === 'warn').length,
    },
    students: built,
  };
}

export async function getStudentDashboard(student: StudentRow): Promise<StudentDashboard> {
  const email = normalizeEmail(student.professor_email);
  const subjects = await listSubjectsForProfessor(email);
  const { attendance, tests } = await loadAggregates(subjects);
  return {
    role: 'student',
    professor: professorFor(email),
    student: buildStudent(student, subjects, attendance, tests),
  };
}
