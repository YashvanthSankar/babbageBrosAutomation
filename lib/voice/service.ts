/**
 * Server-side attendance call orchestration.
 *
 * Importers may call `dispatchAtRiskAttendanceCall` only after detecting a
 * newly-below-threshold transition. This module never runs from a dashboard
 * read, and does not accept a browser-supplied phone number or attendance.
 */
import { query } from '@/lib/db';
import { attendancePercentage } from '@/lib/risk';
import { dispatchAttendanceCall, isIndianE164Phone } from './omnidim';

export class VoiceServiceError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'VoiceServiceError';
    this.status = status;
    this.code = code;
  }
}

interface CallTargetRow {
  student_id: number;
  student_name: string;
  phone: string | null;
  subject_id: number;
  threshold: number;
  present: number;
  recorded: number;
}

export interface VoiceDispatchResult {
  dispatched: boolean;
  status: 'dispatched' | 'duplicate' | 'not_at_risk';
  attendancePercentage: number;
}

/** Students already below the threshold before a correction-safe import. */
export async function findAtRiskStudentIds(
  professorEmail: string,
  subjectId: number,
): Promise<Set<number>> {
  const result = await query<{ student_id: number }>(
    `SELECT s.id AS student_id
       FROM students s
       JOIN subjects sub ON sub.id = $2 AND sub.professor_email = $1
       JOIN attendance_records ar ON ar.student_id = s.id AND ar.subject_id = sub.id
      WHERE s.professor_email = $1
      GROUP BY s.id, sub.threshold
     HAVING COUNT(ar.id) FILTER (WHERE ar.present)::numeric / COUNT(ar.id) * 100 < sub.threshold`,
    [professorEmail, subjectId],
  );
  return new Set(result.rows.map((row) => Number(row.student_id)));
}

async function loadCallTarget(studentId: number, subjectId: number, professorEmail?: string): Promise<CallTargetRow> {
  const ownership = professorEmail ? 'AND s.professor_email = $3 AND sub.professor_email = $3' : '';
  const values: unknown[] = professorEmail ? [studentId, subjectId, professorEmail] : [studentId, subjectId];
  const result = await query<CallTargetRow>(
    `SELECT s.id AS student_id,
            s.name AS student_name,
            s.phone,
            sub.id AS subject_id,
            sub.threshold,
            COUNT(ar.id)::int AS recorded,
            COUNT(ar.id) FILTER (WHERE ar.present)::int AS present
       FROM students s
       JOIN subjects sub ON true
       LEFT JOIN attendance_records ar ON ar.student_id = s.id AND ar.subject_id = sub.id
      WHERE s.id = $1 AND sub.id = $2 ${ownership}
      GROUP BY s.id, s.name, s.phone, sub.id, sub.threshold`,
    values,
  );
  const target = result.rows[0];
  if (!target) throw new VoiceServiceError(404, 'TARGET_NOT_FOUND', 'Student or subject was not found for this professor.');
  return target;
}

/**
 * Dispatch an at-risk notification once per exact attendance snapshot. Calling
 * it again for the same import state returns `duplicate` without a second call.
 */
export async function dispatchAtRiskAttendanceCall(
  studentId: number,
  subjectId: number,
  professorEmail?: string,
): Promise<VoiceDispatchResult> {
  const target = await loadCallTarget(studentId, subjectId, professorEmail);
  const percentage = attendancePercentage(Number(target.present), Number(target.recorded));
  if (percentage === null || percentage >= Number(target.threshold)) {
    return { dispatched: false, status: 'not_at_risk', attendancePercentage: percentage ?? 0 };
  }
  if (!target.phone || !isIndianE164Phone(target.phone)) {
    throw new VoiceServiceError(422, 'INVALID_STUDENT_PHONE', 'This student has no valid Indian E.164 mobile number for voice notification.');
  }

  // Snapshot key: re-running an unchanged import cannot redial. Import code
  // should invoke this only on a new below-threshold transition.
  const key = `omnidim:attendance:${target.student_id}:${target.subject_id}:${target.present}/${target.recorded}:${target.threshold}`;
  const inserted = await query<{ id: number }>(
    `INSERT INTO notification_events (student_id, subject_id, idempotency_key, risk_level, provider, status)
     VALUES ($1, $2, $3, 'below_threshold', 'omnidim_voice', 'pending')
     ON CONFLICT (idempotency_key) DO NOTHING
     RETURNING id`,
    [target.student_id, target.subject_id, key],
  );
  const eventId = inserted.rows[0]?.id;
  if (!eventId) return { dispatched: false, status: 'duplicate', attendancePercentage: percentage };

  try {
    await dispatchAttendanceCall({ toNumber: target.phone, attendancePercentage: percentage });
    await query(`UPDATE notification_events SET status = 'dispatched', sent_at = now() WHERE id = $1`, [eventId]);
    return { dispatched: true, status: 'dispatched', attendancePercentage: percentage };
  } catch (error) {
    await query(`UPDATE notification_events SET status = 'failed' WHERE id = $1`, [eventId]);
    throw error;
  }
}
