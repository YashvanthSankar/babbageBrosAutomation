import { integrationQuery, integrationMutation } from '../integrations-store';
import { getProfessorEmail } from '../env';
import { dispatchAttendanceCall,isIndianE164Phone } from './omnidim';
export class VoiceServiceError extends Error {constructor(readonly status:number,readonly code:string,message:string){super(message);}}
interface Target {studentId:string;subjectId:string;phone:string;attendancePercentage:number|null;threshold:number;present:number;total:number}
export interface VoiceDispatchResult {dispatched:boolean;status:'dispatched'|'duplicate'|'not_at_risk';attendancePercentage:number}
export async function findAtRiskStudentIds(professorEmail:string,subjectId:string):Promise<Set<string>>{
 const targets:Target[]=await integrationQuery('riskTargets',{professorEmail,subjectId});return new Set(targets.filter(t=>t.attendancePercentage!==null&&t.attendancePercentage<t.threshold).map(t=>t.studentId));
}
export async function dispatchAtRiskAttendanceCall(studentId:string,subjectId:string,professorEmail=getProfessorEmail()):Promise<VoiceDispatchResult>{
 const targets:Target[]=await integrationQuery('riskTargets',{professorEmail,subjectId});const target=targets.find(t=>t.studentId===studentId);
 if(!target||target.attendancePercentage===null||target.attendancePercentage>=target.threshold)return {dispatched:false,status:'not_at_risk',attendancePercentage:target?.attendancePercentage??0};
 if(!isIndianE164Phone(target.phone))throw new VoiceServiceError(422,'INVALID_STUDENT_PHONE','Student phone must be an Indian E.164 number.');
 const key=`omnidim:attendance:${studentId}:${subjectId}:${target.present}/${target.total}:${target.threshold}`;
 const id=await integrationMutation('claimNotification',{professorEmail,studentId,subjectId,key,provider:'omnidim_voice'});
 if(!id)return {dispatched:false,status:'duplicate',attendancePercentage:target.attendancePercentage};
 try{await dispatchAttendanceCall({toNumber:target.phone,attendancePercentage:target.attendancePercentage});await integrationMutation('finishNotification',{id,status:'dispatched'});return {dispatched:true,status:'dispatched',attendancePercentage:target.attendancePercentage};}
 catch(error){await integrationMutation('finishNotification',{id,status:'failed'});throw error;}
}
