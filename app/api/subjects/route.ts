/**
 * /api/subjects — professor-scoped subject CRUD.
 *
 * Subjects carry the configurable attendance threshold used by the ingestion
 * risk helpers. Ownership comes from the session, never the request body.
 */
import type { NextResponse } from 'next/server';
import { ApiError, handleRoute, json } from '@/lib/api';
import { query } from '@/lib/db';
import { normalizeEmail } from '@/lib/env';
import { getSession, requireAdmin, sessionEmail } from '@/lib/session';
import { subjectInput, subjectPatch } from '@/lib/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface SubjectRecord {
  id: number;
  name: string;
  code: string;
  department: string | null;
  threshold: number;
}

function serialize(row: SubjectRecord) {
  return {
    id: Number(row.id),
    name: row.name,
    code: row.code,
    department: row.department,
    threshold: Number(row.threshold),
  };
}

function deriveCode(name: string, code?: string | null): string {
  const provided = (code ?? '').trim();
  if (provided) return provided.slice(0, 30);
  const derived = name.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return (derived || 'SUBJECT').slice(0, 30);
}

function isUniqueViolation(error: unknown): boolean {
  return Boolean(error && typeof error === 'object' && (error as { code?: string }).code === '23505');
}

export async function GET(): Promise<NextResponse> {
  return handleRoute(async () => {
    const session = requireAdmin(await getSession());
    const email = normalizeEmail(sessionEmail(session));
    const result = await query<SubjectRecord>(
      `SELECT id, name, code, department, threshold
         FROM subjects
        WHERE professor_email = $1
        ORDER BY name ASC`,
      [email],
    );
    return json({ subjects: result.rows.map(serialize) });
  });
}

export async function POST(request: Request): Promise<NextResponse> {
  return handleRoute(async () => {
    const session = requireAdmin(await getSession());
    const email = normalizeEmail(sessionEmail(session));
    const input = subjectInput.parse(await request.json());
    try {
      const result = await query<SubjectRecord>(
        `INSERT INTO subjects (name, code, department, threshold, professor_email)
              VALUES ($1, $2, $3, $4, $5)
           RETURNING id, name, code, department, threshold`,
        [input.name, deriveCode(input.name, input.code), input.department ?? null, input.threshold, email],
      );
      return json(serialize(result.rows[0]), 201);
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ApiError(409, 'DUPLICATE_SUBJECT', 'A subject with that code already exists.');
      }
      throw error;
    }
  });
}

export async function PATCH(request: Request): Promise<NextResponse> {
  return handleRoute(async () => {
    const session = requireAdmin(await getSession());
    const email = normalizeEmail(sessionEmail(session));
    const { id, name, code, department, threshold } = subjectPatch.parse(await request.json());

    const assignments: string[] = [];
    const values: unknown[] = [];
    const add = (column: string, value: unknown) => {
      values.push(value);
      assignments.push(`${column} = $${values.length}`);
    };
    if (name !== undefined) add('name', name);
    if (code !== undefined) add('code', deriveCode(name ?? code ?? '', code));
    if (department !== undefined) add('department', department ?? null);
    if (threshold !== undefined) add('threshold', threshold);
    if (assignments.length === 0) {
      throw new ApiError(422, 'VALIDATION_ERROR', 'No changes were provided.');
    }
    values.push(id, email);
    const result = await query<SubjectRecord>(
      `UPDATE subjects SET ${assignments.join(', ')}, updated_at = now()
        WHERE id = $${values.length - 1} AND professor_email = $${values.length}
        RETURNING id, name, code, department, threshold`,
      values,
    );
    if (!result.rows[0]) throw new ApiError(404, 'NOT_FOUND', 'Subject not found.');
    return json(serialize(result.rows[0]));
  });
}
