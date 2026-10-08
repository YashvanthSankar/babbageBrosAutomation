/**
 * Ingestion persistence against the canonical PostgreSQL schema (db/schema.sql).
 *
 * This is the integration layer: the parser/preview flow is ported from the
 * `upload` branch, but the writes target this repository's `students`,
 * `subjects`, `attendance_records`, and `test_results` tables so imported data
 * is immediately visible to `GET /api/dashboard`.
 */
import { createHash } from 'node:crypto';
import type { PoolClient } from 'pg';
import { ApiError } from '@/lib/api';
import { query, withTransaction } from '@/lib/db';
import { normalizeEmail } from '@/lib/env';
import type {
  AttendanceEntry,
  ImportPayload,
  KnownStudent,
  MarksEntry,
  RosterRow,
  ValidationReport,
} from './types';

export interface ApplyResult {
  imported: number;
  updated: number;
  errors: { row?: number; message: string }[];
}

export interface StagedImport {
  batchId: number;
  expiresAt: string;
  canConfirm: boolean;
  report: ValidationReport;
  preview: Record<string, unknown>[];
}

export async function listKnownStudents(professorEmail: string): Promise<KnownStudent[]> {
  const result = await query<{ id: number; roll_no: string; active: boolean }>(
    `SELECT id, roll_no, active FROM students WHERE professor_email = $1`,
    [normalizeEmail(professorEmail)],
  );
  return result.rows.map((row) => ({
    id: Number(row.id),
    rollNumber: row.roll_no,
    active: Boolean(row.active),
  }));
}

export interface SubjectRef {
  id: number;
  name: string;
  code: string;
}

export async function requireSubject(
  professorEmail: string,
  subjectId: number,
): Promise<SubjectRef> {
  const result = await query<SubjectRef>(
    `SELECT id, name, code FROM subjects WHERE id = $1 AND professor_email = $2`,
    [subjectId, normalizeEmail(professorEmail)],
  );
  const row = result.rows[0];
  if (!row) throw new ApiError(404, 'SUBJECT_NOT_FOUND', 'Choose a valid subject.');
  return { id: Number(row.id), name: row.name, code: row.code };
}

async function upsertRoster(
  client: PoolClient,
  professorEmail: string,
  rows: readonly RosterRow[],
): Promise<ApplyResult> {
  const email = normalizeEmail(professorEmail);
  let imported = 0;
  let updated = 0;
  for (const row of rows) {
    const result = await client.query<{ inserted: boolean }>(
      `INSERT INTO students (name, roll_no, email, phone, professor_email, active, updated_at)
            VALUES ($1, $2, $3, $4, $5, true, now())
       ON CONFLICT (roll_no)
         DO UPDATE SET name = EXCLUDED.name,
                       email = EXCLUDED.email,
                       phone = EXCLUDED.phone,
                       professor_email = EXCLUDED.professor_email,
                       active = true,
                       updated_at = now()
         RETURNING (xmax = 0) AS inserted`,
      [row.name, row.rollNumber, row.email.toLowerCase(), row.phone || null, email],
    );
    if (result.rows[0]?.inserted) imported += 1;
    else updated += 1;
  }
  return { imported, updated, errors: [] };
}

async function upsertAttendance(
  client: PoolClient,
  professorEmail: string,
  subjectId: number,
  entries: readonly AttendanceEntry[],
): Promise<ApplyResult> {
  const email = normalizeEmail(professorEmail);
  const students = await client.query<{ id: number; roll_no: string }>(
    `SELECT id, roll_no FROM students WHERE professor_email = $1`,
    [email],
  );
  const studentMap = new Map(students.rows.map((row) => [row.roll_no.toLowerCase(), Number(row.id)]));

  let imported = 0;
  let updated = 0;
  const errors: ApplyResult['errors'] = [];
  for (const entry of entries) {
    const studentId = studentMap.get(entry.rollNumber.toLowerCase());
    if (!studentId) {
      errors.push({ message: `No student matches roll number ${entry.rollNumber}.` });
      continue;
    }
    const result = await client.query<{ inserted: boolean }>(
      `INSERT INTO attendance_records (student_id, subject_id, class_date, present, updated_at)
            VALUES ($1, $2, $3, $4, now())
       ON CONFLICT (student_id, subject_id, class_date)
         DO UPDATE SET present = EXCLUDED.present, updated_at = now()
         RETURNING (xmax = 0) AS inserted`,
      [studentId, subjectId, entry.date, entry.status === 'P'],
    );
    if (result.rows[0]?.inserted) imported += 1;
    else updated += 1;
  }
  return { imported, updated, errors };
}

async function upsertMarks(
  client: PoolClient,
  professorEmail: string,
  subjectId: number | null,
  entries: readonly MarksEntry[],
): Promise<ApplyResult> {
  const email = normalizeEmail(professorEmail);
  const students = await client.query<{ id: number; roll_no: string }>(
    `SELECT id, roll_no FROM students WHERE professor_email = $1`,
    [email],
  );
  const studentMap = new Map(students.rows.map((row) => [row.roll_no.toLowerCase(), Number(row.id)]));

  const subjects = await client.query<{ id: number; name: string; code: string }>(
    `SELECT id, name, code FROM subjects WHERE professor_email = $1`,
    [email],
  );
  const subjectMap = new Map<string, number>();
  for (const subject of subjects.rows) {
    subjectMap.set(subject.code.toLowerCase(), Number(subject.id));
    subjectMap.set(subject.name.toLowerCase(), Number(subject.id));
  }

  let imported = 0;
  let updated = 0;
  const errors: ApplyResult['errors'] = [];
  for (const entry of entries) {
    const studentId = studentMap.get(entry.rollNumber.toLowerCase());
    if (!studentId) {
      errors.push({ message: `No student matches roll number ${entry.rollNumber}.` });
      continue;
    }
    const resolvedSubject = subjectId ?? subjectMap.get(entry.subjectRef.toLowerCase()) ?? null;
    if (!resolvedSubject) {
      errors.push({ message: `No subject matches "${entry.subjectRef}".` });
      continue;
    }
    const result = await client.query<{ inserted: boolean }>(
      `INSERT INTO test_results (student_id, subject_id, test_name, test_date, score, max_score, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6, now())
       ON CONFLICT (student_id, subject_id, test_name, test_date)
         DO UPDATE SET score = EXCLUDED.score, max_score = EXCLUDED.max_score, updated_at = now()
         RETURNING (xmax = 0) AS inserted`,
      [studentId, resolvedSubject, entry.testName, entry.testDate, entry.score, entry.maxScore],
    );
    if (result.rows[0]?.inserted) imported += 1;
    else updated += 1;
  }
  return { imported, updated, errors };
}

export function applyRoster(professorEmail: string, rows: readonly RosterRow[]): Promise<ApplyResult> {
  return withTransaction((client) => upsertRoster(client, professorEmail, rows));
}

export function applyAttendance(
  professorEmail: string,
  subjectId: number,
  entries: readonly AttendanceEntry[],
): Promise<ApplyResult> {
  return withTransaction((client) => upsertAttendance(client, professorEmail, subjectId, entries));
}

export function applyMarks(
  professorEmail: string,
  subjectId: number | null,
  entries: readonly MarksEntry[],
): Promise<ApplyResult> {
  return withTransaction((client) => upsertMarks(client, professorEmail, subjectId, entries));
}

export interface StageImportInput {
  professorEmail: string;
  filename: string;
  buffer: Buffer;
  type: ImportPayload['kind'];
  payload: ImportPayload;
  report: ValidationReport;
  preview: Record<string, unknown>[];
  subjectId?: number | null;
}

export async function stageImport(input: StageImportInput): Promise<StagedImport> {
  const checksum = createHash('sha256').update(input.buffer).digest('hex');
  const result = await query<{ id: number; expires_at: Date }>(
    `INSERT INTO import_batches
       (professor_email, subject_id, type, filename, checksum, parsed_payload, validation_report, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, now() + interval '30 minutes')
     RETURNING id, expires_at`,
    [
      normalizeEmail(input.professorEmail),
      input.subjectId ?? null,
      input.type,
      input.filename,
      checksum,
      JSON.stringify(input.payload),
      JSON.stringify(input.report),
    ],
  );
  const row = result.rows[0];
  return {
    batchId: Number(row.id),
    expiresAt: new Date(row.expires_at).toISOString(),
    canConfirm: input.report.errors.length === 0,
    report: input.report,
    preview: input.preview,
  };
}

export interface ConfirmedImport {
  batchId: number;
  type: string;
  processed: number;
}

export async function confirmBatch(
  professorEmail: string,
  batchId: number,
): Promise<ConfirmedImport> {
  const email = normalizeEmail(professorEmail);
  return withTransaction(async (client) => {
    const claimed = await client.query<{
      id: number;
      type: string;
      parsed_payload: ImportPayload;
      validation_report: ValidationReport;
    }>(
      `SELECT id, type, parsed_payload, validation_report
         FROM import_batches
        WHERE id = $1 AND professor_email = $2 AND status = 'pending' AND expires_at > now()
        FOR UPDATE`,
      [batchId, email],
    );
    const batch = claimed.rows[0];
    if (!batch) {
      throw new ApiError(
        409,
        'BATCH_UNAVAILABLE',
        'This preview was not found, expired, or was already confirmed.',
      );
    }
    const report = batch.validation_report;
    if (report?.errors?.length) {
      throw new ApiError(
        409,
        'BATCH_HAS_ERRORS',
        'Fix workbook errors and create a new preview before confirming.',
      );
    }

    await client.query(`UPDATE import_batches SET status = 'processing' WHERE id = $1`, [batch.id]);

    const payload = batch.parsed_payload;
    let result: ApplyResult;
    if (payload.kind === 'roster') {
      result = await upsertRoster(client, email, payload.rows);
    } else if (payload.kind === 'attendance') {
      result = await upsertAttendance(client, email, Number(payload.subjectId), payload.entries);
    } else {
      result = await upsertMarks(client, email, payload.subjectId ?? null, payload.entries);
    }

    await client.query(
      `UPDATE import_batches SET status = 'confirmed', confirmed_at = now() WHERE id = $1`,
      [batch.id],
    );
    return { batchId: Number(batch.id), type: batch.type, processed: result.imported + result.updated };
  });
}
