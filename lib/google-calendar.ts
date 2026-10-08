import { loadProfessorRefreshToken } from './tokens';
import { ApiError } from './api';

async function accessToken(email:string):Promise<string> {
  const token = await loadProfessorRefreshToken(email);
  if (!token || !process.env.GOOGLE_CLIENT_ID || !process.env.GOOGLE_CLIENT_SECRET) throw new ApiError(503,'CALENDAR_NOT_CONNECTED','The professor must connect Google Calendar first.');
  const response = await fetch('https://oauth2.googleapis.com/token',{method:'POST',body:new URLSearchParams({client_id:process.env.GOOGLE_CLIENT_ID,client_secret:process.env.GOOGLE_CLIENT_SECRET,refresh_token:token,grant_type:'refresh_token'}),signal:AbortSignal.timeout(10000),cache:'no-store'});
  const body = await response.json();
  if (!response.ok || !body.access_token) throw new ApiError(503,'CALENDAR_AUTH_FAILED','Google Calendar authorization expired. Ask the professor to reconnect.');
  return body.access_token;
}
export async function googleBusy(email:string,start:string,end:string):Promise<{start:string;end:string}[]> {
  const token = await accessToken(email);
  const response = await fetch('https://www.googleapis.com/calendar/v3/freeBusy',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({timeMin:start,timeMax:end,items:[{id:'primary'}]}),signal:AbortSignal.timeout(10000),cache:'no-store'});
  const body=await response.json();
  if (!response.ok || body.calendars?.primary?.errors) throw new ApiError(503,'CALENDAR_UNAVAILABLE','Google Calendar availability could not be checked.');
  return body.calendars?.primary?.busy ?? [];
}
export async function createGoogleBooking(email:string,input:{start:string;end:string;studentEmail:string;studentName:string;subjectName:string;bookingId:string}):Promise<string> {
  const token=await accessToken(email);
  const response=await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events?sendUpdates=all',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({summary:`Student consultation: ${input.subjectName}`,description:`Consultation with ${input.studentName}`,start:{dateTime:input.start},end:{dateTime:input.end},attendees:[{email:input.studentEmail}]}),signal:AbortSignal.timeout(10000),cache:'no-store'});
  const body=await response.json();
  if (!response.ok || !body.id) throw new ApiError(503,'CALENDAR_EVENT_FAILED','The appointment could not be added to Google Calendar.');
  return body.id;
}
