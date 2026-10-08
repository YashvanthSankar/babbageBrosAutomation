import { handleRoute,json } from '@/lib/api';
import { getSession,requireAdmin,sessionEmail } from '@/lib/session';
import { convexApi,convexClient,convexSecret,getProfessorTeacherId } from '@/lib/convex';
import { parseSubjectId } from '@/lib/imports/http';
import { compareMarksRisk,marksRisk } from '@/lib/marks-risk';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(request:Request){return handleRoute(async()=>{
 const email=sessionEmail(requireAdmin(await getSession())); const subjectId=parseSubjectId(new URL(request.url).searchParams.get('subjectId'));
 const raw=await convexClient().query(convexApi.marksDashboard,{secret:convexSecret(),teacherId:await getProfessorTeacherId(email),subjectId});
 const order=new Map(raw.assessments.map((a:any,i:number)=>[a._id,i]));
 const students=raw.students.map((student:any)=>{const scores=raw.records.filter((r:any)=>r.studentId===student._id).sort((a:any,b:any)=>Number(order.get(a.assessmentId))-Number(order.get(b.assessmentId)));const latest=scores.at(-1)?.percentage??null;const previous=scores.at(-2)?.percentage??null;return{id:student._id,name:student.name,rollNumber:student.rollNumber,email:student.email,latestPercentage:latest,previousPercentage:previous,...marksRisk(latest,previous,raw.subject.marksThreshold)};}).sort(compareMarksRisk);
 return json({data:{subject:{...raw.subject,id:raw.subject._id},assessments:raw.assessments,students,summary:{totalStudents:students.length,weak:students.filter((s:any)=>s.weak).length,falling:students.filter((s:any)=>s.falling).length}}});
});}
