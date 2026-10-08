import {handleRoute,json} from '@/lib/api';
import {getSession,requireAdmin,sessionEmail} from '@/lib/session';
import {convexApi,convexClient,convexSecret,getProfessorTeacherId} from '@/lib/convex';
import {z} from 'zod';
export const runtime='nodejs';
async function scope(){return {secret:convexSecret(),teacherId:await getProfessorTeacherId(sessionEmail(requireAdmin(await getSession())))};}
const input=z.object({name:z.string().trim().min(1),code:z.string().optional(),department:z.string().optional(),threshold:z.coerce.number().min(1).max(99).default(85),marksThreshold:z.coerce.number().min(1).max(100).default(50)});
export async function GET(){return handleRoute(async()=>{const rows=await convexClient().query(convexApi.listSubjects,await scope());return json({subjects:rows.map((r:any)=>({...r,id:r._id,threshold:r.attendanceThreshold,department:r.department??null}))});});}
export async function POST(request:Request){return handleRoute(async()=>{const {threshold,...data}=input.parse(await request.json());const row=await convexClient().mutation(convexApi.createSubject,{...await scope(),subject:{...data,attendanceThreshold:threshold}});return json({subject:{...row,id:row._id}},201);});}
export async function PATCH(request:Request){return handleRoute(async()=>{const {id,...changes}=z.object({id:z.string()}).and(input.partial()).parse(await request.json());const row=await convexClient().mutation(convexApi.updateSubject,{...await scope(),id,changes});return json({subject:{...row,id:row._id}});});}
