/** Assemble role-scoped dashboards from the existing Convex workspace. */
import { workspaceSnapshot, type WorkspaceSnapshot } from './convex-snapshot';
import { studentRow, type StudentRow } from './roster';
import { computeTrend, overallRisk, recoveryClasses, type RiskLevel, type Trend } from './risk';

export interface DashboardSubject {
  id: string; code: string; name: string; department: string | null;
  attended: number; total: number;
  attendancePercent: number | null; classesToRecover: number;
  latestScore: number | null; previousScore: number | null; latestTestName: string | null;
  trend: Trend; atRisk: boolean; riskLevel: RiskLevel; threshold: number; marksThreshold: number;
}
export interface DashboardStudent {
  id: string; name: string; rollNo: string; email: string; department: string | null;
  subjects: DashboardSubject[]; riskLevel: RiskLevel;
}
export interface DashboardProfessor { email: string; name: string | null }
export interface AdminDashboard {
  role: 'admin'; professor: DashboardProfessor;
  stats: { students: number; subjects: number; atRisk: number };
  subjects: { id: string; name: string; code: string }[];
  students: DashboardStudent[];
}
export interface StudentDashboard { role: 'student'; professor: DashboardProfessor; student: DashboardStudent }

function round(value: number) { return Math.round(value * 100) / 100; }

function buildStudent(student: StudentRow, snapshot: WorkspaceSnapshot): DashboardStudent {
  const subjects: DashboardSubject[] = snapshot.subjects.map(subject => {
    const records = snapshot.attendanceRecords.filter(row => row.studentId === student.id && row.subjectId === subject._id);
    const attended = records.filter(row => row.status === 'P').length;
    const total = records.length;
    const percentage = total ? attended / total * 100 : null;
    const threshold = subject.attendanceThreshold ?? 85;
    const tests = snapshot.marksRecords
      .filter(row => row.studentId === student.id && row.subjectId === subject._id)
      .map(row => ({ row, assessment: snapshot.assessments.find(test => test._id === row.assessmentId) }))
      .filter(test => test.assessment)
      .sort((a,b) => a.assessment!.assessmentDate.localeCompare(b.assessment!.assessmentDate));
    const latest = tests.at(-1), previous = tests.at(-2);
    const latestScore = latest ? round(latest.row.percentage) : null;
    const previousScore = previous ? round(previous.row.percentage) : null;
    const trend = computeTrend(latestScore, previousScore);
    const weakMarks = latestScore !== null && latestScore < (subject.marksThreshold ?? 50);
    const fallingMarks = latestScore !== null && previousScore !== null && previousScore - latestScore >= 10;
    const attendanceAtRisk = percentage !== null && percentage < threshold;
    const riskLevel: RiskLevel = attendanceAtRisk || weakMarks || fallingMarks ? 'high'
      : percentage !== null && percentage < threshold + 5 ? 'warn'
      : percentage === null && latestScore === null ? 'unknown' : 'ok';
    return {
      id: subject._id, code: subject.code ?? subject.name, name: subject.name, attended, total,
      department: subject.department ?? null,
      attendancePercent: percentage === null ? null : round(percentage),
      classesToRecover: recoveryClasses(attended,total,threshold), latestScore, previousScore,
      latestTestName: latest?.assessment?.name ?? null, trend,
      atRisk: attendanceAtRisk || weakMarks || fallingMarks, riskLevel, threshold,
      marksThreshold: subject.marksThreshold ?? 50,
    };
  });
  return { id: student.id, name: student.name, rollNo: student.roll_no, email: student.email,
    department: [...new Set(subjects.map(subject => subject.department).filter((value): value is string => Boolean(value)))].length === 1
      ? subjects.find(subject => subject.department)?.department ?? null
      : null,
    subjects, riskLevel: overallRisk(subjects.map(subject => subject.riskLevel)) };
}

export async function getAdminDashboard(professorEmail: string): Promise<AdminDashboard> {
  const snapshot = await workspaceSnapshot(professorEmail);
  const students = snapshot.students.filter(row => row.active).map(row => buildStudent(studentRow(row,professorEmail),snapshot));
  const rank: Record<RiskLevel,number> = { high:0, warn:1, ok:2, unknown:3 };
  students.sort((a,b) => rank[a.riskLevel]-rank[b.riskLevel]
    || Math.min(...a.subjects.map(s=>s.attendancePercent ?? 101))-Math.min(...b.subjects.map(s=>s.attendancePercent ?? 101))
    || a.name.localeCompare(b.name));
  return { role:'admin', professor:{email:professorEmail,name:snapshot.teacher?.name ?? null},
    stats:{students:students.length,subjects:snapshot.subjects.length,atRisk:students.filter(s=>s.riskLevel==='high').length},
     subjects:snapshot.subjects.map(s=>({id:s._id,name:s.name,code:s.code ?? s.name,department:s.department ?? null,threshold:s.attendanceThreshold ?? 85,marksThreshold:s.marksThreshold ?? 50})), students };
}
export async function getStudentDashboard(student: StudentRow): Promise<StudentDashboard> {
  const snapshot = await workspaceSnapshot(student.professor_email);
  return { role:'student', professor:{email:student.professor_email,name:snapshot.teacher?.name ?? null},student:buildStudent(student,snapshot) };
}
