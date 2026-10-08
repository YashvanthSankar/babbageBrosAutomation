import { integrationQuery } from '../integrations-store';
import { getProfessorEmail } from '../env';
interface Target {studentId:string;subjectId:string;phone:string;attendancePercentage:number|null;threshold:number;present:number;total:number}
export interface VoiceDispatchResult {dispatched:boolean;status:'synthetic_demo'|'not_at_risk';attendancePercentage:number}
export async function findAtRiskStudentIds(professorEmail:string,subjectId:string):Promise<Set<string>>{
 const targets:Target[]=await integrationQuery('riskTargets',{professorEmail,subjectId});return new Set(targets.filter(t=>t.attendancePercentage!==null&&t.attendancePercentage<t.threshold).map(t=>t.studentId));
}
export async function dispatchAtRiskAttendanceCall(studentId:string,subjectId:string,professorEmail=getProfessorEmail()):Promise<VoiceDispatchResult>{
 const targets:Target[]=await integrationQuery('riskTargets',{professorEmail,subjectId});const target=targets.find(t=>t.studentId===studentId);
 if(!target||target.attendancePercentage===null||target.attendancePercentage>=target.threshold)return {dispatched:false,status:'not_at_risk',attendancePercentage:target?.attendancePercentage??0};
 // Roster phone numbers belong to synthetic showcase records. Never send them
 // to the provider; only /api/voice/demo-call may dispatch a real call.
 return {dispatched:false,status:'synthetic_demo',attendancePercentage:target.attendancePercentage};
}
