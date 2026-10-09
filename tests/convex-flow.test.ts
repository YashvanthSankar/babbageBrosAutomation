/// <reference types="vite/client" />
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { convexTest } from 'convex-test';
import { api } from '../convex/_generated/api';
import schema from '../convex/schema';

// Exercise the actual Convex handlers and schema against an isolated in-memory backend.
// No production data, provider credentials, inboxes or phone numbers are touched.
const modules = import.meta.glob('../convex/**/*.{ts,js}');
const secret = 'isolated-test-secret';
const professor = 'professor@iiitdm.ac.in';
const report = { errors: [], warnings: [], summary: {} };

beforeEach(() => vi.stubEnv('CONVEX_BACKEND_SECRET', secret));
afterEach(() => vi.unstubAllEnvs());

test('roster → attendance → marks → risk → weekly claim → booking, including corrections and access boundaries', async () => {
  const t = convexTest(schema, modules);
  await expect(t.query(api.backend.health, { secret: 'not-the-secret' })).rejects.toThrow('UNAUTHORIZED_BACKEND');
  const teacher = await t.mutation(api.backend.upsertDemoTeacher, { secret, email: professor, name: 'Demo Professor' });
  const other = await t.mutation(api.backend.upsertDemoTeacher, { secret, email: 'other@iiitdm.ac.in', name: 'Other' });
  const subject = await t.mutation(api.backend.createSubject, {
    secret, teacherId: teacher.id,
    subject: { name: 'Algorithms', code: 'CS101', attendanceThreshold: 85, marksThreshold: 40 },
  });
  if (!subject) throw new Error('Subject creation failed');
  const subjectId = subject._id;

  async function importBatch(type: 'roster' | 'attendance' | 'marks', payload: unknown) {
    const batch = await t.mutation(api.backend.stageImport, {
      secret, teacherId: teacher.id, type, filename: 'synthetic.csv', checksum: 'synthetic',
      payload, report, ...(type === 'roster' ? {} : { subjectId }),
    });
    return t.mutation(api.backend.confirmImport, { secret, teacherId: teacher.id, batchId: batch.batchId });
  }

  const roster = await importBatch('roster', { kind: 'roster', rows: [
    { rollNumber: 'CS001', name: 'Asha Test', email: 'asha@iiitdm.ac.in', phone: '+919000000001' },
    { rollNumber: 'CS002', name: 'Ravi Test', email: 'ravi@iiitdm.ac.in', phone: '+919000000002' },
  ] });
  expect([roster.inserted, roster.updated]).toEqual([2, 0]);
  const students = await t.query(api.backend.listStudents, { secret, teacherId: teacher.id });
  const asha = students[0];

  const attendance = await importBatch('attendance', { kind: 'attendance', subjectId: subject._id, entries: [
    { rollNumber: 'CS001', date: '2026-10-01', status: 'P' },
    { rollNumber: 'CS001', date: '2026-10-02', status: 'A' },
    { rollNumber: 'CS002', date: '2026-10-01', status: 'P' },
  ] });
  expect([attendance.inserted, attendance.updated]).toEqual([3, 0]);
  const correction = await importBatch('attendance', { kind: 'attendance', subjectId: subject._id, entries: [
    { rollNumber: 'CS002', date: '2026-10-01', status: 'A' },
  ] });
  expect([correction.inserted, correction.updated]).toEqual([0, 1]);

  const marks = await importBatch('marks', { kind: 'marks', subjectId: subject._id, entries: [
    { rollNumber: 'CS001', testName: 'Quiz 1', testDate: '2026-10-03', score: 8, maxScore: 10 },
    { rollNumber: 'CS001', testName: 'Quiz 2', testDate: '2026-10-08', score: 3, maxScore: 10 },
  ] });
  expect([marks.inserted, marks.updated]).toEqual([2, 0]);
  const risk = await t.query(api.integrations.riskTargets, { secret, professorEmail: professor });
  expect(risk).toHaveLength(2);
  expect(risk.find(r => r.studentId === asha._id)).toMatchObject({
    present: 1, total: 2, attendancePercentage: 50, classesToRecover: 5,
    latestScore: 30, previousScore: 80, marksRisk: true,
  });
  expect(await t.query(api.integrations.cohortCounts, { secret, professorEmail: professor }))
    .toEqual({ totalStudents: 2, atRiskStudents: 2, subjects: 1 });

  const claim = { secret, professorEmail: professor, key: 'weekly:2026-W41', kind: 'weekly', totalStudents: 2, atRiskStudents: 2 };
  const first = await t.mutation(api.integrations.claimAggregate, claim);
  expect(first).toBeTruthy();
  expect(await t.mutation(api.integrations.claimAggregate, claim)).toBeNull();
  await expect(t.mutation(api.integrations.finishAggregate, { secret, professorEmail: other.email, id: first!, status: 'simulated' }))
    .rejects.toThrow('FORBIDDEN');
  await t.mutation(api.integrations.finishAggregate, { secret, professorEmail: professor, id: first!, status: 'simulated' });
  expect((await t.query(api.integrations.recentAggregates, { secret, professorEmail: professor }))[0])
    .toMatchObject({ status: 'simulated', provider: 'weekly', studentName: '2 of 2 students at risk' });
  const notification = { secret, professorEmail: professor, studentId: asha._id, subjectId,
    key: `email-simulated:${asha._id}:${subjectId}:test-snapshot`, provider: 'resend_email' };
  const notificationId = await t.mutation(api.integrations.claimNotification, notification);
  expect(notificationId).toBeTruthy();
  expect(await t.mutation(api.integrations.claimNotification, notification)).toBeNull();
  await t.mutation(api.integrations.finishNotification, { secret, id: notificationId!, status: 'simulated' });
  expect((await t.query(api.integrations.recentNotifications, { secret, professorEmail: professor }))[0])
    .toMatchObject({ status: 'simulated', studentName: 'Asha Test' });

  const slot = { secret, professorEmail: professor, studentId: asha._id, subjectId: subject._id,
    start: '2026-10-20T09:00:00.000Z', end: '2026-10-20T09:30:00.000Z' };
  await expect(t.mutation(api.integrations.reserve, { ...slot, professorEmail: other.email })).rejects.toThrow('FORBIDDEN');
  const booking = await t.mutation(api.integrations.reserve, slot);
  await expect(t.mutation(api.integrations.reserve, { ...slot, start: '2026-10-20T09:15:00.000Z' })).rejects.toThrow();
  await t.mutation(api.integrations.finishBooking, { secret, id: booking, status: 'confirmed' });
  expect((await t.query(api.integrations.bookings, { secret, professorEmail: professor }))[0].status).toBe('confirmed');
  expect(await t.query(api.integrations.bookings, { secret, professorEmail: other.email })).toEqual([]);
});

test('a legacy simulation cannot block a real send, but a legacy real attempt still blocks it', async () => {
  const t = convexTest(schema, modules);
  await t.mutation(api.backend.upsertDemoTeacher, { secret, email: professor, name: 'Demo Professor' });
  const claim = (kind: string, key: string, legacyKey?: string) =>
    t.mutation(api.integrations.claimAggregate, { secret, professorEmail: professor, kind, key, totalStudents: 0, atRiskStudents: 0, ...(legacyKey ? { legacyKey } : {}) });
  const legacyEmail = await t.run(ctx => ctx.db.insert('aggregateEvents', {professorEmail:professor,key:`${professor}:manual-demo:2026-10-09`,kind:'manual_demo_email',status:'pending',createdAt:Date.now(),totalStudents:0,atRiskStudents:0}));
  expect(legacyEmail).toBeTruthy();
  expect(await claim('manual_demo_email', 'manual-demo-live:2026-10-09', 'manual-demo:2026-10-09')).toBeNull();
  await t.mutation(api.integrations.finishAggregate, { secret, professorEmail: professor, id: legacyEmail!, status: 'simulated' });
  const liveEmail = await claim('manual_demo_email', 'manual-demo-live:2026-10-09', 'manual-demo:2026-10-09');
  expect(liveEmail).toBeTruthy();
  for(let n=1;n<10;n++) expect(await claim('manual_demo_email', 'manual-demo-live:2026-10-09', 'manual-demo:2026-10-09')).toBeTruthy();
  expect(await claim('manual_demo_email', 'manual-demo-live:2026-10-09', 'manual-demo:2026-10-09')).toBeNull();

  const legacyVoice = await t.run(ctx => ctx.db.insert('aggregateEvents', {professorEmail:professor,key:`${professor}:manual-voice:2026-10-09`,kind:'manual_demo_voice',status:'pending',createdAt:Date.now(),totalStudents:0,atRiskStudents:0}));
  await t.mutation(api.integrations.finishAggregate, { secret, professorEmail: professor, id: legacyVoice!, status: 'dispatched' });
  expect(await claim('manual_demo_voice', 'manual-voice-live:2026-10-09', 'manual-voice:2026-10-09')).toBeNull();
  expect(await claim('manual_demo_voice', 'manual-voice-simulation:2026-10-09')).toBeTruthy();
});

test('invalid and replayed import batches never partially apply', async () => {
  const t = convexTest(schema, modules);
  const { id: teacherId } = await t.mutation(api.backend.upsertDemoTeacher, { secret, email: professor, name: 'Professor' });
  const subject = await t.mutation(api.backend.createSubject, { secret, teacherId,
    subject: { name: 'Systems', attendanceThreshold: 75, marksThreshold: 40 } });
  if (!subject) throw new Error('Subject creation failed');
  const create = (entries: unknown[], errors: unknown[] = []) => t.mutation(api.backend.stageImport, {
    secret, teacherId, subjectId: subject._id, type: 'attendance', filename: 'synthetic.csv', checksum: 'x',
    payload: { kind: 'attendance', subjectId: subject._id, entries }, report: { ...report, errors },
  });
  const blocked = await create([], [{ row: 1, message: 'invalid' }]);
  await expect(t.mutation(api.backend.confirmImport, { secret, teacherId, batchId: blocked.batchId })).rejects.toThrow('BATCH_HAS_ERRORS');
  const invalid = await create([
    { rollNumber: 'CS001', date: '2026-10-01', status: 'P' },
    { rollNumber: 'MISSING', date: '2026-10-02', status: 'A' },
  ]);
  await expect(t.mutation(api.backend.confirmImport, { secret, teacherId, batchId: invalid.batchId })).rejects.toThrow('STUDENT_NOT_FOUND');
  expect(await t.run(ctx => ctx.db.query('attendanceRecords').collect())).toHaveLength(0);
  const roster = await t.mutation(api.backend.stageImport, { secret, teacherId, type: 'roster', filename: 'synthetic.csv', checksum: 'x',
    payload: { kind: 'roster', rows: [{ rollNumber: 'CS001', name: 'Asha', email: 'asha@iiitdm.ac.in', phone: '+919000000001' }] }, report });
  await t.mutation(api.backend.confirmImport, { secret, teacherId, batchId: roster.batchId });
  await expect(t.mutation(api.backend.confirmImport, { secret, teacherId, batchId: roster.batchId })).rejects.toThrow('BATCH_UNAVAILABLE');
});

test('roster identity conflicts and impossible assessment corrections roll back atomically', async () => {
  const t = convexTest(schema, modules);
  const { id: teacherId } = await t.mutation(api.backend.upsertDemoTeacher, { secret, email: professor, name: 'Professor' });
  const subject = await t.mutation(api.backend.createSubject, { secret, teacherId,
    subject: { name: 'Mathematics', attendanceThreshold: 85, marksThreshold: 50 } });
  if (!subject) throw new Error('Subject creation failed');
  const stage = (type: 'roster' | 'marks', payload: unknown) => t.mutation(api.backend.stageImport, {
    secret, teacherId, type, filename: 'synthetic.csv', checksum: 'x', payload, report,
    ...(type === 'marks' ? { subjectId: subject._id } : {}),
  });
  const confirm = async (type: 'roster' | 'marks', payload: unknown) => {
    const batch = await stage(type, payload);
    return t.mutation(api.backend.confirmImport, { secret, teacherId, batchId: batch.batchId });
  };
  const firstRoster = { kind: 'roster', rows: [
    { rollNumber: 'CS001', name: 'Asha', email: 'asha@iiitdm.ac.in', phone: '+919000000001' },
    { rollNumber: 'CS002', name: 'Ravi', email: 'ravi@iiitdm.ac.in', phone: '+919000000002' },
  ] };
  await confirm('roster', firstRoster);
  const before = await t.query(api.backend.listStudents, { secret, teacherId });
  const conflict = await stage('roster', { kind: 'roster', rows: [
    { ...firstRoster.rows[0], name: 'Would roll back' },
    { ...firstRoster.rows[0], email: 'ravi@iiitdm.ac.in' },
  ] });
  await expect(t.mutation(api.backend.confirmImport, { secret, teacherId, batchId: conflict.batchId }))
    .rejects.toThrow('ROSTER_IDENTITY_CONFLICT');
  expect((await t.query(api.backend.listStudents, { secret, teacherId })).map(s => s.name)).toEqual(['Asha', 'Ravi']);
  const updated = await confirm('roster', { kind: 'roster', rows: [{ ...firstRoster.rows[0], name: 'Asha Updated' }] });
  expect([updated.inserted, updated.updated]).toEqual([0, 1]);
  expect((await t.query(api.backend.listStudents, { secret, teacherId }))[0]._id).toEqual(before[0]._id);

  const score = (value: number, maxScore: number) => ({ kind: 'marks', subjectId: subject._id, entries: [
    { rollNumber: 'CS001', testName: 'Quiz', testDate: '2026-10-05', score: value, maxScore },
  ] });
  await confirm('marks', score(8, 10));
  const correction = await stage('marks', score(3, 5));
  await expect(t.mutation(api.backend.confirmImport, { secret, teacherId, batchId: correction.batchId }))
    .rejects.toThrow('INVALID_ASSESSMENT_MAX');
  const assessments = await t.run(ctx => ctx.db.query('assessments').collect());
  const records = await t.run(ctx => ctx.db.query('marksRecords').collect());
  expect([assessments.length, assessments[0].maxMarks, records.length, records[0].percentage]).toEqual([1, 10, 1, 80]);
});
