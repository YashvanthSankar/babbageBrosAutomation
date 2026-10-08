import { makeFunctionReference } from 'convex/server';
import { convexClient, convexSecret } from './convex';

export interface ConvexStudent { _id: string; teacherId: string; rollNumber: string; name: string; email: string; phone: string; active: boolean }
export interface ConvexSubject { _id: string; teacherId: string; name: string; code?: string; department?: string; attendanceThreshold: number; marksThreshold: number }
export interface WorkspaceSnapshot {
  teacher: { _id: string; email: string; name: string } | null;
  students: ConvexStudent[];
  subjects: ConvexSubject[];
  attendanceRecords: { studentId: string; subjectId: string; status: 'P'|'A'; attendanceDate: string }[];
  assessments: { _id: string; name: string; assessmentDate: string; maxMarks: number }[];
  marksRecords: { studentId: string; subjectId: string; assessmentId: string; marksObtained: number; percentage: number }[];
}

export async function workspaceSnapshot(professorEmail: string): Promise<WorkspaceSnapshot> {
  return convexClient().query(makeFunctionReference<'query'>('dashboard:snapshot'), {
    secret: convexSecret(), professorEmail: professorEmail.trim().toLowerCase(),
  }) as Promise<WorkspaceSnapshot>;
}
