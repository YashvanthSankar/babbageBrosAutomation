import { and, asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { attendanceRecords, students, subjects } from "@/lib/db/schema";
import { requireTeacherId } from "@/lib/auth";
import { fail, handleRouteError, ok } from "@/lib/api";
import { attendancePercentage, compareRisk, recoveryClasses, riskStatus } from "@/lib/risk";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const teacherId = await requireTeacherId();
    const allSubjects = await db
      .select({ id: subjects.id, name: subjects.name, code: subjects.code, threshold: subjects.threshold })
      .from(subjects)
      .where(eq(subjects.teacherId, teacherId))
      .orderBy(asc(subjects.name));
    const requestedId = new URL(request.url).searchParams.get("subjectId");
    const subject = requestedId
      ? allSubjects.find((item) => item.id === requestedId)
      : allSubjects[0];
    if (requestedId && !subject) return fail("SUBJECT_NOT_FOUND", "Subject not found.", 404);
    if (!subject) return ok({ subjects: allSubjects, selectedSubject: null, summary: null, students: [] });

    const studentRows = await db
      .select({ id: students.id, rollNumber: students.rollNumber, name: students.name, email: students.email })
      .from(students)
      .where(and(eq(students.teacherId, teacherId), eq(students.active, true)))
      .orderBy(asc(students.rollNumber));
    const records = await db
      .select({ studentId: attendanceRecords.studentId, status: attendanceRecords.status })
      .from(attendanceRecords)
      .where(eq(attendanceRecords.subjectId, subject.id));
    const counts = new Map<string, { present: number; absent: number }>();
    for (const record of records) {
      const current = counts.get(record.studentId) ?? { present: 0, absent: 0 };
      if (record.status === "P") current.present += 1;
      else current.absent += 1;
      counts.set(record.studentId, current);
    }
    const riskRows = studentRows
      .map((student) => {
        const count = counts.get(student.id) ?? { present: 0, absent: 0 };
        const recorded = count.present + count.absent;
        const rawPercentage = attendancePercentage(count.present, recorded);
        const percentage = rawPercentage === null ? null : Math.round(rawPercentage * 10) / 10;
        const status = riskStatus(rawPercentage, subject.threshold);
        return {
          ...student,
          present: count.present,
          absent: count.absent,
          recorded,
          percentage,
          status,
          recoveryClasses: recoveryClasses(count.present, recorded, subject.threshold),
        };
      })
      .sort(compareRisk);
    const summary = {
      totalStudents: riskRows.length,
      atRisk: riskRows.filter((student) => student.status === "AT_RISK").length,
      watch: riskRows.filter((student) => student.status === "WATCH").length,
      safe: riskRows.filter((student) => student.status === "SAFE").length,
      noData: riskRows.filter((student) => student.status === "NO_DATA").length,
      classAverage:
        riskRows.filter((student) => student.percentage !== null).length > 0
          ? Math.round(
              (riskRows.reduce((sum, student) => sum + (student.percentage ?? 0), 0) /
                riskRows.filter((student) => student.percentage !== null).length) *
                10,
            ) / 10
          : null,
    };
    return ok({ subjects: allSubjects, selectedSubject: subject, summary, students: riskRows });
  } catch (error) {
    return handleRouteError(error);
  }
}
