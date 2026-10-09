import {handleRoute,json} from '@/lib/api';
import {getSession,requireAdmin} from '@/lib/session';
import {convexApi,convexClient,convexSecret} from '@/lib/convex';
import {demoEmailRecipient,demoVoiceRecipient,liveDemoAutomationsEnabled,manualRecipientDeliveryEnabled} from '@/lib/automation/mode';
import {isIndianE164Phone} from '@/lib/voice/omnidim';
import {resendSandboxSender} from '@/lib/email/demo';
import {weeklyReadiness} from '@/lib/email/weekly';

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
    const voiceConfigured=Boolean(process.env.OMNIDIM_API_KEY&&Number.isInteger(Number(process.env.OMNIDIM_AGENT_ID))&&Number(process.env.OMNIDIM_AGENT_ID)>0&&Number.isInteger(Number(process.env.OMNIDIM_FROM_NUMBER_ID))&&Number(process.env.OMNIDIM_FROM_NUMBER_ID)>0);
    const emailTestRecipientConfigured=/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(demoEmailRecipient());
    const voiceTestRecipientConfigured=isIndianE164Phone(demoVoiceRecipient());
    const calendarConfigured=Boolean(process.env.GOOGLE_CLIENT_ID&&process.env.GOOGLE_CLIENT_SECRET&&session.user.hasCalendar);
    return json({
      database,
      demoMode,
      mode:liveDemo?'live':'simulation',
       email:{configured:emailConfigured,testRecipientConfigured:emailTestRecipientConfigured,liveAllowed:liveDemo&&emailConfigured&&emailTestRecipientConfigured,sandboxSender:resendSandboxSender(process.env.RESEND_FROM_EMAIL??'')},
      voice:{configured:voiceConfigured,testRecipientConfigured:voiceTestRecipientConfigured,liveAllowed:liveDemo&&voiceConfigured&&voiceTestRecipientConfigured},
      manualEnteredContacts:{serverEnabled:manualRecipientDeliveryEnabled(),professorVerified:session.user.verifiedProfessor === true},
      calendar:{connected:calendarConfigured},
       weeklySummary:weeklyReadiness(),
    });
  });
}
