import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

function authorize(secret: string) {
  const configured = process.env.CONVEX_BACKEND_SECRET;
  if (!configured || secret !== configured) throw new Error("UNAUTHORIZED_BACKEND");
}

function normalize(value: string) {
  return value.trim().toLowerCase();
}

async function requireTeacher(ctx: any, teacherId: any) {
  const teacher = await ctx.db.get(teacherId);
  if (!teacher) throw new Error("TEACHER_NOT_FOUND");
  return teacher;
}

async function requireSubject(ctx: any, teacherId: any, subjectId: any) {
  const subject = await ctx.db.get(subjectId);
  if (!subject || subject.teacherId !== teacherId) throw new Error("SUBJECT_NOT_FOUND");
  return subject;
}

export const upsertDemoTeacher = mutation({
  args: { secret: v.string(), email: v.string(), name: v.string() },
  handler: async (ctx, args) => {
    authorize(args.secret);
    const existing = await ctx.db.query("teachers").withIndex("by_email", (q: any) => q.eq("email", args.email)).unique();
    if (existing) {
      await ctx.db.patch(existing._id, { name: args.name });
      return { id: existing._id, email: existing.email, name: args.name };
    }
    const id = await ctx.db.insert("teachers", { email: args.email, name: args.name, createdAt: Date.now() });
    return { id, email: args.email, name: args.name };
  },
});

export const listStudents = query({
  args: { secret: v.string(), teacherId: v.any() },
  handler: async (ctx, args) => {
    authorize(args.secret); await requireTeacher(ctx, args.teacherId);
    const rows = await ctx.db.query("students").withIndex("by_teacher", (q: any) => q.eq("teacherId", args.teacherId)).collect();
    return rows.sort((a: any, b: any) => a.rollNumber.localeCompare(b.rollNumber));
  },
});

export const createStudent = mutation({
  args: { secret: v.string(), teacherId: v.any(), student: v.any() },
  handler: async (ctx, args) => {
    authorize(args.secret); await requireTeacher(ctx, args.teacherId);
    const normalizedRoll = normalize(args.student.rollNumber);
    const existing = await ctx.db.query("students").withIndex("by_teacher_roll", (q: any) => q.eq("teacherId", args.teacherId).eq("normalizedRoll", normalizedRoll)).unique();
    if (existing) throw new Error("DUPLICATE_ROLL");
    const now = Date.now();
    const id = await ctx.db.insert("students", { teacherId: args.teacherId, ...args.student, normalizedRoll, active: true, createdAt: now, updatedAt: now });
    return await ctx.db.get(id);
  },
});

export const updateStudent = mutation({
  args: { secret: v.string(), teacherId: v.any(), id: v.any(), changes: v.any() },
  handler: async (ctx, args) => {
    authorize(args.secret);
    const student = await ctx.db.get(args.id);
    if (!student || student.teacherId !== args.teacherId) throw new Error("STUDENT_NOT_FOUND");
    if (args.changes.rollNumber) {
      const normalizedRoll = normalize(args.changes.rollNumber);
      const duplicate = await ctx.db.query("students").withIndex("by_teacher_roll", (q: any) => q.eq("teacherId", args.teacherId).eq("normalizedRoll", normalizedRoll)).unique();
      if (duplicate && duplicate._id !== args.id) throw new Error("DUPLICATE_ROLL");
      args.changes.normalizedRoll = normalizedRoll;
    }
    await ctx.db.patch(args.id, { ...args.changes, updatedAt: Date.now() });
    return await ctx.db.get(args.id);
  },
});

export const listSubjects = query({
  args: { secret: v.string(), teacherId: v.any() },
  handler: async (ctx, args) => {
    authorize(args.secret); await requireTeacher(ctx, args.teacherId);
    const rows = await ctx.db.query("subjects").withIndex("by_teacher", (q: any) => q.eq("teacherId", args.teacherId)).collect();
    return rows.sort((a: any, b: any) => a.name.localeCompare(b.name));
  },
});

export const createSubject = mutation({
  args: { secret: v.string(), teacherId: v.any(), subject: v.any() },
  handler: async (ctx, args) => {
    authorize(args.secret); await requireTeacher(ctx, args.teacherId);
    const normalizedName = normalize(args.subject.name);
    const existing = await ctx.db.query("subjects").withIndex("by_teacher_name", (q: any) => q.eq("teacherId", args.teacherId).eq("normalizedName", normalizedName)).unique();
    if (existing) throw new Error("DUPLICATE_SUBJECT");
    const now = Date.now();
    const id = await ctx.db.insert("subjects", { teacherId: args.teacherId, ...args.subject, normalizedName, createdAt: now, updatedAt: now });
    return await ctx.db.get(id);
  },
});

export const updateSubject = mutation({
  args: { secret: v.string(), teacherId: v.any(), id: v.any(), changes: v.any() },
  handler: async (ctx, args) => {
    authorize(args.secret);
    const subject = await requireSubject(ctx, args.teacherId, args.id);
    if (args.changes.name) {
      const normalizedName = normalize(args.changes.name);
      const duplicate = await ctx.db.query("subjects").withIndex("by_teacher_name", (q: any) => q.eq("teacherId", args.teacherId).eq("normalizedName", normalizedName)).unique();
      if (duplicate && duplicate._id !== subject._id) throw new Error("DUPLICATE_SUBJECT");
      args.changes.normalizedName = normalizedName;
    }
    await ctx.db.patch(args.id, { ...args.changes, updatedAt: Date.now() });
    return await ctx.db.get(args.id);
  },
});

export const stageImport = mutation({
  args: { secret: v.string(), teacherId: v.any(), subjectId: v.optional(v.any()), type: v.string(), filename: v.string(), checksum: v.string(), payload: v.any(), report: v.any() },
  handler: async (ctx, args) => {
    authorize(args.secret); await requireTeacher(ctx, args.teacherId);
    if (args.subjectId) await requireSubject(ctx, args.teacherId, args.subjectId);
    const id = await ctx.db.insert("importBatches", { teacherId: args.teacherId, subjectId: args.subjectId, type: args.type, filename: args.filename, checksum: args.checksum, status: "pending", parsedPayload: args.payload, validationReport: args.report, expiresAt: Date.now() + 30 * 60_000, createdAt: Date.now() });
    return { batchId: id, expiresAt: Date.now() + 30 * 60_000 };
  },
});

export const confirmImport = mutation({
  args: { secret: v.string(), teacherId: v.any(), batchId: v.any() },
  handler: async (ctx, args) => {
    authorize(args.secret);
    const batch = await ctx.db.get(args.batchId);
    if (!batch || batch.teacherId !== args.teacherId || batch.status !== "pending" || batch.expiresAt <= Date.now()) throw new Error("BATCH_UNAVAILABLE");
    if (batch.validationReport.errors?.length) throw new Error("BATCH_HAS_ERRORS");
    await ctx.db.patch(batch._id, { status: "processing" });
    let processed = 0;
    if (batch.type === "roster") {
      for (const row of batch.parsedPayload.rows) {
        const normalizedRoll = normalize(row.rollNumber);
        const existing = await ctx.db.query("students").withIndex("by_teacher_roll", (q: any) => q.eq("teacherId", args.teacherId).eq("normalizedRoll", normalizedRoll)).unique();
        const values = { rollNumber: row.rollNumber, normalizedRoll, name: row.name, email: row.email, phone: row.phone, active: true, updatedAt: Date.now() };
        if (existing) await ctx.db.patch(existing._id, values);
        else await ctx.db.insert("students", { teacherId: args.teacherId, ...values, createdAt: Date.now() });
        processed += 1;
      }
    } else if (batch.type === "attendance") {
      await requireSubject(ctx, args.teacherId, batch.parsedPayload.subjectId);
      for (const entry of batch.parsedPayload.entries) {
        const student = await ctx.db.query("students").withIndex("by_teacher_roll", (q: any) => q.eq("teacherId", args.teacherId).eq("normalizedRoll", normalize(entry.rollNumber))).unique();
        if (!student) throw new Error(`STUDENT_NOT_FOUND:${entry.rollNumber}`);
        const existing = await ctx.db.query("attendanceRecords").withIndex("by_student_subject_date", (q: any) => q.eq("studentId", student._id).eq("subjectId", batch.parsedPayload.subjectId).eq("attendanceDate", entry.date)).unique();
        const values = { status: entry.status, sourceImportId: batch._id, updatedAt: Date.now() };
        if (existing) await ctx.db.patch(existing._id, values);
        else await ctx.db.insert("attendanceRecords", { studentId: student._id, subjectId: batch.parsedPayload.subjectId, attendanceDate: entry.date, ...values, createdAt: Date.now() });
        processed += 1;
      }
    } else {
      const payload = batch.parsedPayload;
      await requireSubject(ctx, args.teacherId, payload.subjectId);
      let assessment = await ctx.db.query("assessments").withIndex("by_subject_date_name", (q: any) => q.eq("subjectId", payload.subjectId).eq("assessmentDate", payload.assessmentDate).eq("normalizedName", normalize(payload.assessmentName))).unique();
      const assessmentValues = { name: payload.assessmentName, normalizedName: normalize(payload.assessmentName), assessmentDate: payload.assessmentDate, maxMarks: payload.maxMarks, sourceImportId: batch._id, updatedAt: Date.now() };
      if (assessment) {
        if (assessment.maxMarks !== payload.maxMarks) {
          const existingScores = (await ctx.db.query("marksRecords").withIndex("by_subject", (q: any) => q.eq("subjectId", payload.subjectId)).collect()).filter((record: any) => record.assessmentId === assessment._id);
          for (const score of existingScores) await ctx.db.patch(score._id, { percentage: (score.marksObtained / payload.maxMarks) * 100, updatedAt: Date.now() });
        }
        await ctx.db.patch(assessment._id, assessmentValues);
      }
      else {
        const assessmentId = await ctx.db.insert("assessments", { teacherId: args.teacherId, subjectId: payload.subjectId, ...assessmentValues, createdAt: Date.now() });
        assessment = await ctx.db.get(assessmentId);
      }
      for (const row of payload.rows) {
        const student = await ctx.db.query("students").withIndex("by_teacher_roll", (q: any) => q.eq("teacherId", args.teacherId).eq("normalizedRoll", normalize(row.rollNumber))).unique();
        if (!student) throw new Error(`STUDENT_NOT_FOUND:${row.rollNumber}`);
        const existing = await ctx.db.query("marksRecords").withIndex("by_student_assessment", (q: any) => q.eq("studentId", student._id).eq("assessmentId", assessment._id)).unique();
        const values = { marksObtained: row.marksObtained, percentage: (row.marksObtained / payload.maxMarks) * 100, sourceImportId: batch._id, updatedAt: Date.now() };
        if (existing) await ctx.db.patch(existing._id, values);
        else await ctx.db.insert("marksRecords", { studentId: student._id, subjectId: payload.subjectId, assessmentId: assessment._id, ...values, createdAt: Date.now() });
        processed += 1;
      }
    }
    await ctx.db.patch(batch._id, { status: "confirmed", confirmedAt: Date.now() });
    return { batchId: batch._id, type: batch.type, processed };
  },
});

export const dashboard = query({
  args: { secret: v.string(), teacherId: v.any(), subjectId: v.optional(v.any()) },
  handler: async (ctx, args) => {
    authorize(args.secret);
    const subjects = (await ctx.db.query("subjects").withIndex("by_teacher", (q: any) => q.eq("teacherId", args.teacherId)).collect()).sort((a: any, b: any) => a.name.localeCompare(b.name));
    const subject = args.subjectId ? subjects.find((item: any) => item._id === args.subjectId) : subjects[0];
    if (args.subjectId && !subject) throw new Error("SUBJECT_NOT_FOUND");
    if (!subject) return { subjects, selectedSubject: null, students: [] };
    const students = (await ctx.db.query("students").withIndex("by_teacher", (q: any) => q.eq("teacherId", args.teacherId)).collect()).filter((student: any) => student.active);
    const records = await ctx.db.query("attendanceRecords").withIndex("by_subject", (q: any) => q.eq("subjectId", subject._id)).collect();
    return { subjects, selectedSubject: subject, students, records };
  },
});

export const marksDashboard = query({
  args: { secret: v.string(), teacherId: v.any(), subjectId: v.any() },
  handler: async (ctx, args) => {
    authorize(args.secret);
    const subject = await requireSubject(ctx, args.teacherId, args.subjectId);
    const students = (await ctx.db.query("students").withIndex("by_teacher", (q: any) => q.eq("teacherId", args.teacherId)).collect()).filter((student: any) => student.active);
    const assessments = (await ctx.db.query("assessments").withIndex("by_subject", (q: any) => q.eq("subjectId", args.subjectId)).collect()).sort((a: any, b: any) => a.assessmentDate.localeCompare(b.assessmentDate) || a.createdAt - b.createdAt);
    const records = await ctx.db.query("marksRecords").withIndex("by_subject", (q: any) => q.eq("subjectId", args.subjectId)).collect();
    return { subject, students, assessments, records };
  },
});

export const health = query({
  args: { secret: v.string() },
  handler: async (_ctx, args) => { authorize(args.secret); return { status: "ok" }; },
});
