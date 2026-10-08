import { requireTeacherId } from "@/lib/auth";
import { fail, handleRouteError, ok } from "@/lib/api";
import { convexApi, convexClient, convexSecret } from "@/lib/convex";
import { compareMarksRisk, marksRisk } from "@/lib/marks-risk";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const teacherId = await requireTeacherId();
    const subjectId = new URL(request.url).searchParams.get("subjectId");
    if (!subjectId) return fail("VALIDATION_ERROR", "subjectId is required.", 422);
    const raw = await convexClient().query(convexApi.marksDashboard, { secret: convexSecret(), teacherId, subjectId });
    const assessmentOrder = new Map<string, number>(raw.assessments.map((assessment: any, index: number) => [String(assessment._id), index]));
    const rows = raw.students.map((student: any) => {
      const scores = raw.records
        .filter((record: any) => record.studentId === student._id)
        .sort((a: any, b: any) => (assessmentOrder.get(String(a.assessmentId)) ?? 0) - (assessmentOrder.get(String(b.assessmentId)) ?? 0));
      const latest = scores.at(-1) ?? null;
      const previous = scores.at(-2) ?? null;
      const risk = marksRisk(latest?.percentage ?? null, previous?.percentage ?? null, raw.subject.marksThreshold);
      const averagePercentage = scores.length ? Math.round((scores.reduce((sum: number, score: any) => sum + score.percentage, 0) / scores.length) * 10) / 10 : null;
      return {
        id: student._id, rollNumber: student.rollNumber, name: student.name, email: student.email,
        latestPercentage: latest ? Math.round(latest.percentage * 10) / 10 : null,
        previousPercentage: previous ? Math.round(previous.percentage * 10) / 10 : null,
        averagePercentage, assessmentsRecorded: scores.length,
        change: risk.change === null ? null : Math.round(risk.change * 10) / 10,
        weak: risk.weak, falling: risk.falling, status: risk.status,
      };
    }).sort(compareMarksRisk);
    const measured = rows.filter((row: any) => row.latestPercentage !== null);
    const summary = {
      totalStudents: rows.length,
      critical: rows.filter((row: any) => row.status === "CRITICAL").length,
      weak: rows.filter((row: any) => row.weak).length,
      falling: rows.filter((row: any) => row.falling).length,
      noData: rows.filter((row: any) => row.status === "NO_DATA").length,
      latestClassAverage: measured.length ? Math.round((measured.reduce((sum: number, row: any) => sum + row.latestPercentage, 0) / measured.length) * 10) / 10 : null,
    };
    return ok({
      subject: { id: raw.subject._id, name: raw.subject.name, code: raw.subject.code ?? null, marksThreshold: raw.subject.marksThreshold },
      assessments: raw.assessments.map((assessment: any) => ({ id: assessment._id, name: assessment.name, assessmentDate: assessment.assessmentDate, maxMarks: assessment.maxMarks })),
      summary,
      students: rows,
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes("SUBJECT_NOT_FOUND")) return fail("SUBJECT_NOT_FOUND", "Subject not found.", 404);
    return handleRouteError(error);
  }
}

