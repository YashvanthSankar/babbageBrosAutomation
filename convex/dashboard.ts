import { queryGeneric } from 'convex/server';
import { v } from 'convex/values';

function authorize(secret: string) {
  if (!process.env.CONVEX_BACKEND_SECRET || secret !== process.env.CONVEX_BACKEND_SECRET) throw new Error('UNAUTHORIZED_BACKEND');
}

/** Server-only workspace snapshot; never directly exposed to the browser. */
export const snapshot = queryGeneric({
  args: { secret: v.string(), professorEmail: v.string() },
  handler: async (ctx, args) => {
    authorize(args.secret);
    const teacher = await ctx.db.query('teachers').withIndex('by_email', q => q.eq('email', args.professorEmail.trim().toLowerCase())).first();
    if (!teacher) return { teacher: null, students: [], subjects: [], attendanceRecords: [], assessments: [], marksRecords: [] };
    const students = await ctx.db.query('students').withIndex('by_teacher', q => q.eq('teacherId', teacher._id)).collect();
    const subjects = await ctx.db.query('subjects').withIndex('by_teacher', q => q.eq('teacherId', teacher._id)).collect();
    const attendanceRecords: any[] = [], assessments: any[] = [], marksRecords: any[] = [];
    for (const subject of subjects) {
      attendanceRecords.push(...await ctx.db.query('attendanceRecords').withIndex('by_subject', q => q.eq('subjectId', subject._id)).collect());
      assessments.push(...await ctx.db.query('assessments').withIndex('by_subject', q => q.eq('subjectId', subject._id)).collect());
      marksRecords.push(...await ctx.db.query('marksRecords').withIndex('by_subject', q => q.eq('subjectId', subject._id)).collect());
    }
    return { teacher, students, subjects, attendanceRecords, assessments, marksRecords };
  },
});
