/**
 * Roster / subject lookups. All reads are parameterized.
 */
import { query } from './db';
import { normalizeEmail } from './env';

export interface StudentRow {
  id: number;
  name: string;
  roll_no: string;
  email: string;
  phone: string | null;
  professor_email: string;
}

export interface SubjectRow {
  id: number;
  name: string;
  code: string;
  professor_email: string;
  department: string | null;
}

export async function findStudentByEmail(email: string): Promise<StudentRow | null> {
  const result = await query<StudentRow>(
    `SELECT id, name, roll_no, email, phone, professor_email
       FROM students
      WHERE email = $1
      LIMIT 1`,
    [normalizeEmail(email)],
  );
  return result.rows[0] ?? null;
}

export async function findStudentById(id: number): Promise<StudentRow | null> {
  const result = await query<StudentRow>(
    `SELECT id, name, roll_no, email, phone, professor_email
       FROM students
      WHERE id = $1
      LIMIT 1`,
    [id],
  );
  return result.rows[0] ?? null;
}

export async function findSubjectById(id: number): Promise<SubjectRow | null> {
  const result = await query<SubjectRow>(
    `SELECT id, name, code, professor_email, department
       FROM subjects
      WHERE id = $1
      LIMIT 1`,
    [id],
  );
  return result.rows[0] ?? null;
}

export async function listSubjectsForProfessor(professorEmail: string): Promise<SubjectRow[]> {
  const result = await query<SubjectRow>(
    `SELECT id, name, code, professor_email, department
       FROM subjects
      WHERE professor_email = $1
      ORDER BY code ASC`,
    [normalizeEmail(professorEmail)],
  );
  return result.rows;
}

export async function listStudentsForProfessor(professorEmail: string): Promise<StudentRow[]> {
  const result = await query<StudentRow>(
    `SELECT id, name, roll_no, email, phone, professor_email
       FROM students
      WHERE professor_email = $1
      ORDER BY name ASC, roll_no ASC`,
    [normalizeEmail(professorEmail)],
  );
  return result.rows;
}
