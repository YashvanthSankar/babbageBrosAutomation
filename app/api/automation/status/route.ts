import {handleRoute,json} from '@/lib/api';
import {getSession,requireAdmin} from '@/lib/session';
import {convexApi,convexClient,convexSecret} from '@/lib/convex';
import {demoEmailRecipient,demoVoiceRecipient,liveDemoAutomationsEnabled} from '@/lib/automation/mode';
import {isIndianE164Phone} from '@/lib/voice/omnidim';

export const runtime='nodejs';
export const dynamic='force-dynamic';

export async function GET(){
  return handleRoute(async()=>{
    const session=requireAdmin(await getSession());
    let database='unavailable';
    try{await convexClient().query(convexApi.health,{secret:convexSecret()});database='connected';}catch{}
    const demoMode=(process.env.DEMO_AUTH_ENABLED??'').trim().toLowerCase()==='true';
    const liveDemo=liveDemoAutomationsEnabled();
    const emailConfigured=Boolean(process.env.RESEND_API_KEY&&process.env.RESEND_FROM_EMAIL);
    const voiceConfigured=Boolean(process.env.OMNIDIM_API_KEY&&process.env.OMNIDIM_AGENT_ID&&process.env.OMNIDIM_FROM_NUMBER_ID);
    const emailTestRecipientConfigured=/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(demoEmailRecipient());
    const voiceTestRecipientConfigured=isIndianE164Phone(demoVoiceRecipient());
    const calendarConfigured=Boolean(process.env.GOOGLE_CLIENT_ID&&process.env.GOOGLE_CLIENT_SECRET&&session.user.hasCalendar);
    return json({
      database,
      demoMode,
      mode:liveDemo?'live':'simulation',
      email:{configured:emailConfigured,testRecipientConfigured:emailTestRecipientConfigured,liveAllowed:liveDemo&&emailConfigured&&emailTestRecipientConfigured},
      voice:{configured:voiceConfigured,testRecipientConfigured:voiceTestRecipientConfigured,liveAllowed:liveDemo&&voiceConfigured&&voiceTestRecipientConfigured},
      calendar:{connected:calendarConfigured},
      weeklySummary:{configured:false},
    });
  });
}
