import { z } from 'zod';
import { handleRoute,json,ApiError } from '@/lib/api';
import { getSession,requireAdmin,sessionEmail } from '@/lib/session';
import { readUploadFile,parseSubjectId } from '@/lib/imports/http';
import { parseMarksWorkbook } from '@/lib/imports/parser';
import { parseMarksCsv } from '@/lib/imports/csv';
import { requireSubject,listKnownStudents,stageImport } from '@/lib/imports/service';
export const runtime='nodejs';
export async function POST(request:Request){return handleRoute(async()=>{
 const email=sessionEmail(requireAdmin(await getSession())); const form=await request.formData();
 const subjectId=parseSubjectId(form.get('subjectId'));await requireSubject(email,subjectId);
 const file=await readUploadFile(form.get('file'));
 const metadata=z.object({assessmentName:z.string().trim().min(2),assessmentDate:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),maxMarks:z.coerce.number().positive()}).parse({assessmentName:form.get('assessmentName'),assessmentDate:form.get('assessmentDate'),maxMarks:form.get('maxMarks')});
 if(new Date(metadata.assessmentDate).toISOString().slice(0,10)!==metadata.assessmentDate)throw new ApiError(422,'INVALID_DATE','Invalid assessment date');
 const result=file.kind==='xlsx'?await parseMarksWorkbook(file.buffer,{...metadata,subjectId},await listKnownStudents(email)):parseMarksCsv(file.buffer.toString('utf8'),subjectId);
 return json({data:await stageImport({professorEmail:email,filename:file.filename,buffer:file.buffer,type:'marks',payload:result.payload,report:result.report,preview:result.preview,subjectId})});
});}
