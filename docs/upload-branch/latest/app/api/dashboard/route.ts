import { requireTeacherId } from "@/lib/auth";
import { fail, handleRouteError, ok } from "@/lib/api";
import { convexApi, convexClient, convexSecret } from "@/lib/convex";
import { attendancePercentage, compareRisk, recoveryClasses, riskStatus } from "@/lib/risk";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const teacherId = await requireTeacherId();
    const subjectId = new URL(request.url).searchParams.get("subjectId") || undefined;
    const raw = await convexClient().query(convexApi.dashboard, { secret: convexSecret(), teacherId, subjectId });
    const subjects = raw.subjects.map((subject: any) => ({ id: subject._id, name: subject.name, code: subject.code ?? null, attendanceThreshold: subject.attendanceThreshold, marksThreshold: subject.marksThreshold }));
    if (!raw.selectedSubject) return ok({ subjects, selectedSubject: null, summary: null, students: [] });
    const counts = new Map<string, { present: number; absent: number }>();
    for (const record of raw.records) {
      const current = counts.get(record.studentId) ?? { present: 0, absent: 0 };
      record.status === "P" ? (current.present += 1) : (current.absent += 1);
      counts.set(record.studentId, current);
    }
    const threshold = raw.selectedSubject.attendanceThreshold;
    const rows = raw.students.map((student: any) => {
      const count = counts.get(student._id) ?? { present: 0, absent: 0 };
      const recorded = count.present + count.absent;
      const rawPercentage = attendancePercentage(count.present, recorded);
      return { id: student._id, rollNumber: student.rollNumber, name: student.name, email: student.email, present: count.present, absent: count.absent, recorded, percentage: rawPercentage === null ? null : Math.round(rawPercentage * 10) / 10, status: riskStatus(rawPercentage, threshold), recoveryClasses: recoveryClasses(count.present, recorded, threshold) };
    }).sort(compareRisk);
    const measured = rows.filter((row: any) => row.percentage !== null);
    const summary = { totalStudents: rows.length, atRisk: rows.filter((row: any) => row.status === "AT_RISK").length, watch: rows.filter((row: any) => row.status === "WATCH").length, safe: rows.filter((row: any) => row.status === "SAFE").length, noData: rows.filter((row: any) => row.status === "NO_DATA").length, classAverage: measured.length ? Math.round((measured.reduce((sum: number, row: any) => sum + row.percentage, 0) / measured.length) * 10) / 10 : null };
    return ok({ subjects, selectedSubject: subjects.find((subject: any) => subject.id === raw.selectedSubject._id), summary, students: rows });
  } catch (error) {
    if (error instanceof Error && error.message.includes("SUBJECT_NOT_FOUND")) return fail("SUBJECT_NOT_FOUND", "Subject not found.", 404);
    return handleRouteError(error);
  }
}

