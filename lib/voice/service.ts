import { integrationMutation, integrationQuery } from '../integrations-store';
import { getProfessorEmail } from '../env';
import { demoVoiceRecipient, liveDemoAutomationsEnabled, liveDemoDailyKey } from '../automation/mode';
import { dispatchAttendanceCall, isIndianE164Phone } from './omnidim';

export class VoiceServiceError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) {
    super(message);
  }
}

interface Target {
  studentId: string;
  subjectId: string;
  phone: string;
  attendancePercentage: number | null;
  threshold: number;
  present: number;
  total: number;
}

export interface VoiceDispatchResult {
  dispatched: boolean;
  status: 'dispatched' | 'simulated' | 'duplicate' | 'not_at_risk';
  attendancePercentage: number;
}

export async function findAtRiskStudentIds(
  professorEmail: string,
  subjectId: string,
): Promise<Set<string>> {
  const targets: Target[] = await integrationQuery('riskTargets', { professorEmail, subjectId });
  return new Set(
    targets
      .filter((target) => target.attendancePercentage !== null && target.attendancePercentage < target.threshold)
      .map((target) => target.studentId),
  );
}

export async function dispatchAtRiskAttendanceCall(
  studentId: string,
  subjectId: string,
  professorEmail = getProfessorEmail(),
): Promise<VoiceDispatchResult> {
  const targets: Target[] = await integrationQuery('riskTargets', { professorEmail, subjectId });
  const target = targets.find((row) => row.studentId === studentId);
  if (!target || target.attendancePercentage === null || target.attendancePercentage >= target.threshold) {
    return {
      dispatched: false,
      status: 'not_at_risk',
      attendancePercentage: target?.attendancePercentage ?? 0,
    };
  }

  const live = liveDemoAutomationsEnabled();
  const recipient = live ? demoVoiceRecipient() : '';
  if (live && !isIndianE164Phone(recipient)) {
    throw new VoiceServiceError(
      503,
      'VOICE_TEST_RECIPIENT_REQUIRED',
      'Live demo calls require a valid, consenting DEMO_AUTOMATION_PHONE configured on the server.',
    );
  }

  const snapshot = `${target.present}/${target.total}:${target.threshold}`;
  const key = live
    ? liveDemoDailyKey('omnidim-live')
    : `omnidim-simulated:attendance:${studentId}:${subjectId}:${snapshot}`;
  const id = await integrationMutation('claimNotification', {
    professorEmail,
    studentId,
    subjectId,
    key,
    provider: 'omnidim_voice',
  });
  if (!id) {
    return { dispatched: false, status: 'duplicate', attendancePercentage: target.attendancePercentage };
  }

  if (!live) {
    await integrationMutation('finishNotification', { id, status: 'simulated' });
    return { dispatched: false, status: 'simulated', attendancePercentage: target.attendancePercentage };
  }

  try {
    // Never disclose an uploaded student's real number or academic details.
    // Live demo uses only the pinned test number and fixed synthetic context.
    await dispatchAttendanceCall({ toNumber: recipient, attendancePercentage: 80 });
    await integrationMutation('finishNotification', { id, status: 'dispatched' });
    return { dispatched: true, status: 'dispatched', attendancePercentage: target.attendancePercentage };
  } catch (error) {
    await integrationMutation('finishNotification', { id, status: 'failed' });
    throw error;
  }
}
