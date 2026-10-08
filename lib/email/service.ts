import { createHash } from 'node:crypto';
import { integrationMutation, integrationQuery } from '../integrations-store';
interface RiskTarget {studentId:string;subjectId:string;name:string;email:string;subjectName:string;attendancePercentage:number|null;threshold:number;classesToRecover:number;latestScore:number|null;previousScore:number|null;marksRisk:boolean;present:number;total:number}
/** VPS import postcommit hook; no emails are sent by dashboard reads. */
export async function dispatchRiskEmails(professorEmail:string,subjectId?:string) {
  if(!process.env.RESEND_API_KEY || !process.env.RESEND_FROM_EMAIL)return {sent:0,failed:0,skipped:1,reason:'Email sender is not configured'};
  const targets:RiskTarget[]=await integrationQuery('riskTargets',{professorEmail,...(subjectId?{subjectId}:{})});
  let sent=0,failed=0,skipped=0;
  for(const target of targets){
    const facts=[`Hello ${target.name},`,`Your ${target.subjectName} progress needs attention.`];
    if(target.attendancePercentage!==null)facts.push(`Attendance: ${target.present}/${target.total} (${target.attendancePercentage.toFixed(1)}%). Required: ${target.threshold}%. Attend ${target.classesToRecover} consecutive classes to reach the requirement.`);
    if(target.latestScore!==null)facts.push(`Latest test: ${target.latestScore.toFixed(1)}%.${target.previousScore!==null?` Previous test: ${target.previousScore.toFixed(1)}%.`:''}`);
    facts.push('Please review your dashboard and book an advising appointment with your professor.');
    const snapshot=createHash('sha256').update(JSON.stringify([target.present,target.total,target.latestScore,target.previousScore,target.threshold])).digest('hex').slice(0,20);
    for(const recipient of Array.from(new Set([target.email,professorEmail,process.env.FACULTY_ADVISER_EMAIL].filter((x):x is string=>Boolean(x))))){
      const key=`email:${target.studentId}:${target.subjectId}:${snapshot}:${recipient}`;
      const id=await integrationMutation('claimNotification',{professorEmail,studentId:target.studentId,subjectId:target.subjectId,key,provider:'resend_email'});
      if(!id){skipped++;continue;}
      try{const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:`Bearer ${process.env.RESEND_API_KEY}`,'Content-Type':'application/json','Idempotency-Key':key},body:JSON.stringify({from:process.env.RESEND_FROM_EMAIL,to:[recipient],subject:`Academic progress warning: ${target.subjectName}`,text:recipient===target.email?facts.join('\n\n'):`Student: ${target.name} (${target.email})\n\n${facts.slice(1).join('\n\n')}`}),signal:AbortSignal.timeout(10000)});if(!response.ok)throw new Error('EMAIL_DISPATCH_FAILED');await integrationMutation('finishNotification',{id,status:'dispatched'});sent++;}
      catch{await integrationMutation('finishNotification',{id,status:'failed'});failed++;}
    }
  }
  return {sent,failed,skipped};
}
