import {handleRoute,json} from '@/lib/api';
import {getSession,requireAdmin,sessionEmail} from '@/lib/session';
import {integrationQuery} from '@/lib/integrations-store';

export const runtime='nodejs';
export const dynamic='force-dynamic';

export async function GET(){
  return handleRoute(async()=>{
    const session=requireAdmin(await getSession());
    const events=await integrationQuery('recentNotifications',{professorEmail:sessionEmail(session)});
    return json({events});
  });
}
