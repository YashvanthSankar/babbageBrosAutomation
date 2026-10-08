import { v, ConvexError } from 'convex/values';
import { query, mutation } from './_generated/server';
function authorize(secret:string) { if(!process.env.CONVEX_BACKEND_SECRET || process.env.CONVEX_BACKEND_SECRET!==secret) throw new Error('UNAUTHORIZED_BACKEND'); }
export const token = query({args:{secret:v.string(),professorEmail:v.string()},handler:async(ctx,args)=>{authorize(args.secret); return ctx.db.query('calendarTokens').withIndex('by_professor',q=>q.eq('professorEmail',args.professorEmail)).unique();}});
export const saveToken = mutation({args:{secret:v.string(),professorEmail:v.string(),encrypted:v.string()},handler:async(ctx,args)=>{authorize(args.secret);const existing=await ctx.db.query('calendarTokens').withIndex('by_professor',q=>q.eq('professorEmail',args.professorEmail)).unique();if(existing) await ctx.db.patch(existing._id,{encrypted:args.encrypted});else await ctx.db.insert('calendarTokens',{professorEmail:args.professorEmail,encrypted:args.encrypted});}});
export const bookings = query({args:{secret:v.string(),professorEmail:v.string()},handler:async(ctx,args)=>{authorize(args.secret);return (await ctx.db.query('bookings').withIndex('by_professor',q=>q.eq('professorEmail',args.professorEmail)).collect()).filter(b=>b.status==='pending'||b.status==='confirmed');}});
export const reserve = mutation({args:{secret:v.string(),professorEmail:v.string(),studentId:v.id('students'),subjectId:v.id('subjects'),start:v.string(),end:v.string()},handler:async(ctx,args)=>{
 authorize(args.secret);const student=await ctx.db.get(args.studentId);const subject=await ctx.db.get(args.subjectId);const teacher=subject?await ctx.db.get(subject.teacherId):null;
 if(!student||!subject||student.teacherId!==subject.teacherId||teacher?.email!==args.professorEmail)throw new Error('FORBIDDEN');
 const all=await ctx.db.query('bookings').withIndex('by_professor',q=>q.eq('professorEmail',args.professorEmail)).collect();
 if(all.some(b=>(b.status==='pending'||b.status==='confirmed')&&b.start<args.end&&b.end>args.start))throw new ConvexError('SLOT_UNAVAILABLE');
 return ctx.db.insert('bookings',{professorEmail:args.professorEmail,studentId:args.studentId,subjectId:args.subjectId,start:args.start,end:args.end,status:'pending'});
}});
export const finishBooking = mutation({args:{secret:v.string(),id:v.id('bookings'),status:v.string(),googleEventId:v.optional(v.string())},handler:async(ctx,args)=>{authorize(args.secret);await ctx.db.patch(args.id,{status:args.status,...(args.googleEventId?{googleEventId:args.googleEventId}:{})});}});
export const claimNotification = mutation({args:{secret:v.string(),professorEmail:v.string(),studentId:v.id('students'),subjectId:v.id('subjects'),key:v.string(),provider:v.string()},handler:async(ctx,args)=>{authorize(args.secret);const existing=await ctx.db.query('notificationEvents').withIndex('by_key',q=>q.eq('key',args.key)).unique();if(existing)return null;const {secret,...record}=args;return ctx.db.insert('notificationEvents',{...record,status:'pending'});}});
export const finishNotification = mutation({args:{secret:v.string(),id:v.id('notificationEvents'),status:v.string()},handler:async(ctx,args)=>{authorize(args.secret);await ctx.db.patch(args.id,{status:args.status,...(args.status==='dispatched'?{sentAt:Date.now()}:{})});}});
export const recentNotifications = query({args:{secret:v.string(),professorEmail:v.string()},handler:async(ctx,args)=>{
  authorize(args.secret);
  const events=await ctx.db.query('notificationEvents').withIndex('by_professor',q=>q.eq('professorEmail',args.professorEmail)).collect();
  const recent=events.sort((a,b)=>b._creationTime-a._creationTime).slice(0,40);
  return Promise.all(recent.map(async event=>{
    const [student,subject]=await Promise.all([ctx.db.get(event.studentId),ctx.db.get(event.subjectId)]);
    return {id:event._id,provider:event.provider,status:event.status,createdAt:event._creationTime,sentAt:event.sentAt??null,studentName:student?.name??'Removed student',subjectName:subject?.name??'Removed subject'};
  }));
}});
export const riskTargets = query({args:{secret:v.string(),professorEmail:v.string(),subjectId:v.optional(v.id('subjects'))},handler:async(ctx,args)=>{
 authorize(args.secret);const teacher=await ctx.db.query('teachers').withIndex('by_email',q=>q.eq('email',args.professorEmail)).unique();if(!teacher)return [];
 const subjects=(await ctx.db.query('subjects').withIndex('by_teacher',q=>q.eq('teacherId',teacher._id)).collect()).filter(s=>!args.subjectId||s._id===args.subjectId);
 const students=await ctx.db.query('students').withIndex('by_teacher',q=>q.eq('teacherId',teacher._id)).collect();const targets=[];
 for(const subject of subjects){const attendance=await ctx.db.query('attendanceRecords').withIndex('by_subject',q=>q.eq('subjectId',subject._id)).collect();const marks=await ctx.db.query('marksRecords').withIndex('by_subject',q=>q.eq('subjectId',subject._id)).collect();const assessments=await ctx.db.query('assessments').withIndex('by_subject',q=>q.eq('subjectId',subject._id)).collect();
 for(const student of students.filter(s=>s.active)){const records=attendance.filter(a=>a.studentId===student._id);const present=records.filter(a=>a.status==='P').length;const total=records.length;const percentage=total?present/total*100:null;const sorted=marks.filter(m=>m.studentId===student._id).sort((a,b)=>(assessments.find(t=>t._id===b.assessmentId)?.assessmentDate??'').localeCompare(assessments.find(t=>t._id===a.assessmentId)?.assessmentDate??''));const latest=sorted[0]?.percentage??null;const previous=sorted[1]?.percentage??null;const marksRisk=latest!==null&&(latest<subject.marksThreshold||(previous!==null&&previous-latest>=10));
 if((percentage!==null&&percentage<subject.attendanceThreshold)||marksRisk)targets.push({studentId:student._id,subjectId:subject._id,name:student.name,email:student.email,phone:student.phone,subjectName:subject.name,present,total,attendancePercentage:percentage,threshold:subject.attendanceThreshold,classesToRecover:total?Math.max(0,Math.ceil((subject.attendanceThreshold*total-100*present)/(100-subject.attendanceThreshold))):0,latestScore:latest,previousScore:previous,marksRisk});
 }}return targets;
}});

/** Aggregate counts only. No student identities or contact details leave Convex. */
export const cohortCounts = query({args:{secret:v.string(),professorEmail:v.string()},handler:async(ctx,args)=>{
 authorize(args.secret);
 const teacher=await ctx.db.query('teachers').withIndex('by_email',q=>q.eq('email',args.professorEmail)).unique();
 if(!teacher)return {totalStudents:0,atRiskStudents:0,subjects:0};
 const [students,subjects]=await Promise.all([
  ctx.db.query('students').withIndex('by_teacher',q=>q.eq('teacherId',teacher._id)).collect(),
  ctx.db.query('subjects').withIndex('by_teacher',q=>q.eq('teacherId',teacher._id)).collect(),
 ]);
 const active=students.filter(s=>s.active);const risky=new Set<string>();
 for(const subject of subjects){
  const [attendance,marks,assessments]=await Promise.all([
   ctx.db.query('attendanceRecords').withIndex('by_subject',q=>q.eq('subjectId',subject._id)).collect(),
   ctx.db.query('marksRecords').withIndex('by_subject',q=>q.eq('subjectId',subject._id)).collect(),
   ctx.db.query('assessments').withIndex('by_subject',q=>q.eq('subjectId',subject._id)).collect(),
  ]);
  const dates=new Map(assessments.map(a=>[String(a._id),a.assessmentDate]));
  for(const student of active){
   const rows=attendance.filter(a=>a.studentId===student._id);
   const lowAttendance=rows.length>0 && rows.filter(a=>a.status==='P').length/rows.length*100<subject.attendanceThreshold;
   const scores=marks.filter(m=>m.studentId===student._id).sort((a,b)=>(dates.get(String(b.assessmentId))??'').localeCompare(dates.get(String(a.assessmentId))??''));
   const latest=scores[0]?.percentage,previous=scores[1]?.percentage;
   if(lowAttendance || (latest!==undefined && (latest<subject.marksThreshold || (previous!==undefined && previous-latest>=10))))risky.add(String(student._id));
  }
 }
 return {totalStudents:active.length,atRiskStudents:risky.size,subjects:subjects.length};
}});

/** Atomic, professor-scoped at-most-once claim, also survives VPS restarts. */
export const claimAggregate = mutation({args:{secret:v.string(),professorEmail:v.string(),key:v.string(),kind:v.string(),totalStudents:v.number(),atRiskStudents:v.number()},handler:async(ctx,args)=>{
 authorize(args.secret);
 const teacher=await ctx.db.query('teachers').withIndex('by_email',q=>q.eq('email',args.professorEmail)).unique();
 if(!teacher)throw new Error('FORBIDDEN');
 const key=`${args.professorEmail}:${args.key}`;
 const existing=await ctx.db.query('aggregateEvents').withIndex('by_key',q=>q.eq('key',key)).unique();
 if(existing)return null;
 return ctx.db.insert('aggregateEvents',{professorEmail:args.professorEmail,key,kind:args.kind,status:'pending',createdAt:Date.now(),totalStudents:args.totalStudents,atRiskStudents:args.atRiskStudents});
}});
export const finishAggregate = mutation({args:{secret:v.string(),professorEmail:v.string(),id:v.id('aggregateEvents'),status:v.union(v.literal('simulated'),v.literal('dispatched'),v.literal('failed'))},handler:async(ctx,args)=>{
 authorize(args.secret);const event=await ctx.db.get(args.id);
 if(!event||event.professorEmail!==args.professorEmail||event.status!=='pending')throw new Error('FORBIDDEN');
 await ctx.db.patch(args.id,{status:args.status,...(args.status==='dispatched'?{sentAt:Date.now()}:{})});
}});
export const recentAggregates = query({args:{secret:v.string(),professorEmail:v.string()},handler:async(ctx,args)=>{
 authorize(args.secret);
 return (await ctx.db.query('aggregateEvents').withIndex('by_professor',q=>q.eq('professorEmail',args.professorEmail)).order('desc').take(30)).map(e=>({id:e._id,provider:e.kind,status:e.status,createdAt:e.createdAt,sentAt:e.sentAt??null,studentName:`${e.atRiskStudents} of ${e.totalStudents} students at risk`,subjectName:'Aggregate only'}));
}});
