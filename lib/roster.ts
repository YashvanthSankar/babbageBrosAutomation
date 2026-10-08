/** Session-scoped Convex roster access. */
import { getProfessorEmail } from './env';
import { workspaceSnapshot, type ConvexStudent, type ConvexSubject } from './convex-snapshot';

export interface StudentRow {
  id: string; name: string; roll_no: string; email: string; phone: string | null; professor_email: string;
}
export interface SubjectRow {
  id: string; name: string; code: string; professor_email: string; department: string | null; threshold: number; marksThreshold: number;
}
export function studentRow(row: ConvexStudent, professorEmail: string): StudentRow {
  return { id: row._id, name: row.name, roll_no: row.rollNumber, email: row.email, phone: row.phone || null, professor_email: professorEmail };
}
export function subjectRow(row: ConvexSubject, professorEmail: string): SubjectRow {
  return { id: row._id, name: row.name, code: row.code ?? row.name, professor_email: professorEmail, department: row.department ?? null, threshold: row.attendanceThreshold, marksThreshold: row.marksThreshold };
}
export async function findStudentByEmail(email: string): Promise<StudentRow | null> {
  const professor = getProfessorEmail();
  const snapshot = await workspaceSnapshot(professor);
  const student = snapshot.students.find(row => row.active && row.email.trim().toLowerCase() === email.trim().toLowerCase());
  return student ? studentRow(student, professor) : null;
}
export async function findStudentById(id: string | number): Promise<StudentRow | null> {
  const professor = getProfessorEmail();
  const snapshot = await workspaceSnapshot(professor);
  const student = snapshot.students.find(row => row.active && row._id === String(id));
  return student ? studentRow(student, professor) : null;
}
export async function findSubjectById(id: string | number): Promise<SubjectRow | null> {
  const professor = getProfessorEmail();
  const snapshot = await workspaceSnapshot(professor);
  const subject = snapshot.subjects.find(row => row._id === String(id));
  return subject ? subjectRow(subject, professor) : null;
}
export async function listSubjectsForProfessor(professorEmail: string): Promise<SubjectRow[]> {
  return (await workspaceSnapshot(professorEmail)).subjects.map(row => subjectRow(row, professorEmail));
}
export async function listStudentsForProfessor(professorEmail: string): Promise<StudentRow[]> {
  return (await workspaceSnapshot(professorEmail)).students.filter(row => row.active).map(row => studentRow(row, professorEmail));
}
