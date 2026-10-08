import {handleRoute,json} from '@/lib/api';
import {convexApi,convexClient,convexSecret} from '@/lib/convex';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(){return handleRoute(async()=>json(await convexClient().query(convexApi.health,{secret:convexSecret()})));}
