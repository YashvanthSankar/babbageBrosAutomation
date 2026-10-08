import {handleRoute,json} from '@/lib/api';
import {getSession,requireAdmin,sessionEmail} from '@/lib/session';
import {integrationQuery} from '@/lib/integrations-store';

export const runtime='nodejs';
export const dynamic='force-dynamic';

export async function GET(){
  return handleRoute(async()=>{
    const session=requireAdmin(await getSession());
    const professorEmail=sessionEmail(session);
    const [notifications,aggregates]=await Promise.all([
      integrationQuery('recentNotifications',{professorEmail}),
      integrationQuery('recentAggregates',{professorEmail}),
    ]);
    const events=[...(notifications as Array<{createdAt:number}>),...(aggregates as Array<{createdAt:number}>)].sort((a,b)=>b.createdAt-a.createdAt).slice(0,40);
    return json({events});
  });
}
