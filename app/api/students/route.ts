import {handleRoute,json} from '@/lib/api';
import {getSession,requireAdmin,sessionEmail} from '@/lib/session';
import {convexApi,convexClient,convexSecret,getProfessorTeacherId} from '@/lib/convex';
import {studentInput,studentPatch} from '@/lib/validation';
export const runtime='nodejs';
async function scope(){return {secret:convexSecret(),teacherId:await getProfessorTeacherId(sessionEmail(requireAdmin(await getSession())))};}
export async function GET(){return handleRoute(async()=>{const rows=await convexClient().query(convexApi.listStudents,await scope());return json({students:rows.map((r:any)=>({...r,id:r._id}))});});}
export async function POST(request:Request){return handleRoute(async()=>{const data=studentInput.parse(await request.json());const row=await convexClient().mutation(convexApi.createStudent,{...await scope(),student:{...data,email:data.email.toLowerCase(),phone:data.phone??''}});return json({student:{...row,id:row._id}},201);});}
export async function PATCH(request:Request){return handleRoute(async()=>{const {id,...changes}=studentPatch.parse(await request.json());const row=await convexClient().mutation(convexApi.updateStudent,{...await scope(),id,changes});return json({student:{...row,id:row._id}});});}
