/**
 * /api/students — professor-scoped student CRUD.
 *
 * The professor identity is always derived from the authenticated session; a
 * client-supplied owner is never accepted. This is the roster-first surface the
 * dashboard and import flow rely on.
 */
import type { NextResponse } from 'next/server';
import { ApiError, handleRoute, json } from '@/lib/api';
import { query } from '@/lib/db';
import { normalizeEmail } from '@/lib/env';
import { getSession, requireAdmin, sessionEmail } from '@/lib/session';
import { studentInput, studentPatch } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface StudentRecord {
  id: number;
  roll_no: string;
  name: string;
  email: string;
  phone: string | null;
  active: boolean;
}

function serialize(row: StudentRecord) {
  return {
    id: Number(row.id),
    rollNumber: row.roll_no,
    name: row.name,
    email: row.email,
    phone: row.phone,
    active: Boolean(row.active),
  };
}

function isUniqueViolation(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && (error as { code?: string }).code === '23505');
}

export async function GET(): Promise<NextResponse> {
  return handleRoute(async () => {
    const session = requireAdmin(await getSession());
    const email = normalizeEmail(sessionEmail(session));
    const result = await query<StudentRecord>(
      `SELECT id, roll_no, name, email, phone, active
         FROM students
        WHERE professor_email = $1
        ORDER BY roll_no ASC`,
      [email],
    );
    return json({ students: result.rows.map(serialize) });
  });
}

export async function POST(request: Request): Promise<NextResponse> {
  return handleRoute(async () => {
    const session = requireAdmin(await getSession());
    const email = normalizeEmail(sessionEmail(session));
    const input = studentInput.parse(await request.json());
    try {
      const result = await query<StudentRecord>(
        `INSERT INTO students (name, roll_no, email, phone, professor_email)
              VALUES ($1, $2, $3, $4, $5)
           RETURNING id, roll_no, name, email, phone, active`,
        [input.name, input.rollNumber, input.email.toLowerCase(), input.phone ?? null, email],
      );
      return json(serialize(result.rows[0]), 201);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ApiError(409, 'DUPLICATE_ROLL', 'That roll number or email already exists.');
      }
      throw error;
    }
  });
}

export async function PATCH(request: Request): Promise<NextResponse> {
  return handleRoute(async () => {
    const session = requireAdmin(await getSession());
    const email = normalizeEmail(sessionEmail(session));
    const { id, rollNumber, name, email: studentEmail, phone, active } = studentPatch.parse(
      await request.json(),
    );

    const assignments: string[] = [];
    const values: unknown[] = [];
    const add = (column: string, value: unknown) => {
      values.push(value);
      assignments.push(`${column} = $${values.length}`);
    };
    if (rollNumber !== undefined) add('roll_no', rollNumber);
    if (name !== undefined) add('name', name);
    if (studentEmail !== undefined) add('email', studentEmail.toLowerCase());
    if (phone !== undefined) add('phone', phone ?? null);
    if (active !== undefined) add('active', active);
    if (assignments.length === 0) {
      throw new ApiError(422, 'VALIDATION_ERROR', 'No changes were provided.');
    }
    values.push(id, email);
    const result = await query<StudentRecord>(
      `UPDATE students SET ${assignments.join(', ')}, updated_at = now()
        WHERE id = $${values.length - 1} AND professor_email = $${values.length}
        RETURNING id, roll_no, name, email, phone, active`,
      values,
    );
    if (!result.rows[0]) throw new ApiError(404, 'NOT_FOUND', 'Student not found.');
    return json(serialize(result.rows[0]));
  });
}
