import { createHash } from 'node:crypto';
import { ApiError } from '@/lib/api';
import { convexApi, convexClient, convexSecret, getProfessorTeacherId } from '@/lib/convex';
import type { AttendanceEntry, ImportPayload, KnownStudent, MarksEntry, RosterRow, ValidationReport } from './types';
import { dispatchRiskEmails } from '@/lib/email/service';
import { integrationQuery } from '@/lib/integrations-store';
import { dispatchAtRiskAttendanceCall } from '@/lib/voice/service';
export interface ApplyResult { imported: number; updated: number; errors: {row?:number;message:string}[] }
export interface StagedImport { batchId: string; expiresAt: string; canConfirm: boolean; report: ValidationReport; preview: Record<string, unknown>[] }
export async function listKnownStudents(email: string): Promise<KnownStudent[]> {
 const rows = await convexClient().query(convexApi.listStudents, { secret:convexSecret(), teacherId:await getProfessorTeacherId(email) });
 return rows.map((row:any) => ({id:row._id,rollNumber:row.rollNumber,active:row.active}));
}
export interface SubjectRef { id:string;name:string;code:string }
export async function requireSubject(email:string, subjectId:string):Promise<SubjectRef> {
 const rows=await convexClient().query(convexApi.listSubjects,{secret:convexSecret(),teacherId:await getProfessorTeacherId(email)});
 const row=rows.find((r:any)=>r._id===subjectId);
 if(!row) throw new ApiError(404,'SUBJECT_NOT_FOUND','Choose a valid subject.');
 return {id:row._id,name:row.name,code:row.code??''};
}
export interface StageImportInput { professorEmail:string;filename:string;buffer:Buffer;type:ImportPayload['kind'];payload:ImportPayload;report:ValidationReport;preview:Record<string,unknown>[];subjectId?:string|null }
export async function stageImport(input:StageImportInput):Promise<StagedImport> {
 const result=await convexClient().mutation(convexApi.stageImport,{secret:convexSecret(),teacherId:await getProfessorTeacherId(input.professorEmail),...(input.subjectId?{subjectId:input.subjectId}:{}),type:input.type,filename:input.filename,checksum:createHash('sha256').update(input.buffer).digest('hex'),payload:input.payload,report:input.report});
 return {batchId:result.batchId,expiresAt:new Date(result.expiresAt).toISOString(),canConfirm:input.report.errors.length===0,report:input.report,preview:input.preview};
}
export interface ConfirmedImport {batchId:string;type:string;processed:number;inserted:number;updated:number}
export async function confirmBatch(email:string,batchId:string):Promise<ConfirmedImport> {
 let before: {studentId:string;subjectId:string;attendancePercentage:number|null;threshold:number}[]=[];
 let beforeLoaded=false;
 try {before=await integrationQuery('riskTargets',{professorEmail:email});beforeLoaded=true;}catch{ /* provider storage must not prevent imports */ }
 let result:ConfirmedImport;
 try {result=await convexClient().mutation(convexApi.confirmImport,{secret:convexSecret(),teacherId:await getProfessorTeacherId(email),batchId});}
 catch(error){ const message=error instanceof Error?error.message:'';throw new ApiError(409,'IMPORT_REJECTED',message.includes('BATCH')?'This preview expired, contains errors, or was already confirmed.':'Import validation changed. No records were applied; create a fresh preview.'); }
 if(result.type==='attendance'||result.type==='marks') {
   try {await dispatchRiskEmails(email);}catch{console.error('[email] post-import dispatch failed');}
   if(result.type==='attendance'&&beforeLoaded) {
     try {
       const after:typeof before=await integrationQuery('riskTargets',{professorEmail:email});
       const previouslyAtRisk=new Set(before
         .filter(target=>target.attendancePercentage!==null&&target.attendancePercentage<target.threshold)
         .map(target=>`${target.studentId}:${target.subjectId}`));
       await Promise.all(after
         .filter(target=>target.attendancePercentage!==null&&target.attendancePercentage<target.threshold&&!previouslyAtRisk.has(`${target.studentId}:${target.subjectId}`))
         .map(async target=>{
           try {await dispatchAtRiskAttendanceCall(target.studentId,target.subjectId,email);}
           catch {console.error('[voice] post-import dispatch failed');}
         }));
     } catch {console.error('[voice] post-import risk lookup failed');}
   }
 }
 return result;
}
async function apply(email:string,payload:ImportPayload):Promise<ApplyResult> {
 const staged=await stageImport({professorEmail:email,filename:'dashboard-upload',buffer:Buffer.from(JSON.stringify(payload)),type:payload.kind,payload,report:{errors:[],warnings:[],summary:{}},preview:[],subjectId:payload.kind==='roster'?null:payload.subjectId});
 const result=await confirmBatch(email,staged.batchId);
 return {imported:result.inserted,updated:result.updated,errors:[]};
}
export function applyRoster(email:string,rows:readonly RosterRow[]):Promise<ApplyResult>{return apply(email,{kind:'roster',rows:[...rows]});}
export function applyAttendance(email:string,subjectId:string,entries:readonly AttendanceEntry[]):Promise<ApplyResult>{return apply(email,{kind:'attendance',subjectId,entries:[...entries]});}
export function applyMarks(email:string,subjectId:string|null,entries:readonly MarksEntry[]):Promise<ApplyResult>{return apply(email,{kind:'marks',subjectId,entries:[...entries]});}
