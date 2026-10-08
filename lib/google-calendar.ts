/**
 * Google Calendar REST client (no googleapis dependency).
 *
 * Uses the professor's stored refresh token to mint a short-lived access token,
 * then calls FreeBusy and Events. Failures are surfaced as typed errors so the
 * API layer can return honest, actionable states instead of pretending the
 * calendar is connected.
 */
import { isGoogleConfigured } from './env';
import { getProfessorTokenData } from './tokens';

export class CalendarNotConfiguredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CalendarNotConfiguredError';
  }
}

export class CalendarAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CalendarAuthError';
  }
}

export class CalendarApiError extends Error {
  readonly status?: number;
  constructor(message: string, status?: number) {
    super(message);
    this.name = 'CalendarApiError';
    this.status = status;
  }
}

export function isCalendarConfigured(): boolean {
  return isGoogleConfigured();
}

const TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const FREEBUSY_ENDPOINT = 'https://www.googleapis.com/calendar/v3/freeBusy';
const EVENTS_ENDPOINT = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';

interface GoogleErrorPayload {
  error?: string;
  error_description?: string;
}

async function readJson(response: Response): Promise<Record<string, unknown> | null> {
  try {
    return (await response.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** Mint an access token from the professor's encrypted refresh token. */
export async function getProfessorAccessToken(email: string): Promise<string> {
  if (!isGoogleConfigured()) {
    throw new CalendarNotConfiguredError(
      'Google OAuth is not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.',
    );
  }
  const data = await getProfessorTokenData(email);
  if (!data?.refreshToken) {
    throw new CalendarAuthError(
      'The professor has not connected Google Calendar. Sign in with the "Professor (Google Calendar)" option to grant calendar access.',
    );
  }

  const response = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID ?? '',
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? '',
      refresh_token: data.refreshToken,
      grant_type: 'refresh_token',
    }).toString(),
    cache: 'no-store',
  });

  const payload = (await readJson(response)) as GoogleErrorPayload | null;
  if (!response.ok || !payload || typeof payload !== 'object') {
    throw new CalendarAuthError(
      `Google refused to refresh the calendar token (${payload?.error ?? response.status}). Reconnect the calendar account.`,
    );
  }
  const accessToken = (payload as Record<string, unknown>).access_token;
  if (typeof accessToken !== 'string' || accessToken.length === 0) {
    throw new CalendarAuthError(
      'Google returned no access token; the professor must reconnect the calendar account.',
    );
  }
  return accessToken;
}

export interface BusyInterval {
  start: string;
  end: string;
}

/** Query the professor's primary-calendar busy intervals for a window (ISO UTC). */
export async function queryFreeBusy(
  email: string,
  timeMinIso: string,
  timeMaxIso: string,
): Promise<BusyInterval[]> {
  const token = await getProfessorAccessToken(email);
  const response = await fetch(FREEBUSY_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      timeMin: timeMinIso,
      timeMax: timeMaxIso,
      items: [{ id: 'primary' }],
    }),
    cache: 'no-store',
  });

  const payload = (await readJson(response)) as {
    calendars?: {
      primary?: { busy?: BusyInterval[]; errors?: unknown[] };
    };
  } | null;

  if (response.status === 401 || response.status === 403) {
    throw new CalendarAuthError(
      'Google Calendar access was denied. The professor must reconnect the calendar account.',
    );
  }
  if (!response.ok) {
    throw new CalendarApiError(`Google FreeBusy request failed (${response.status}).`, response.status);
  }
  const calendar = payload?.calendars?.primary;
  if (calendar?.errors && calendar.errors.length > 0) {
    throw new CalendarApiError('Google FreeBusy reported an error for the primary calendar.');
  }
  return Array.isArray(calendar?.busy) ? calendar.busy : [];
}

export interface CreateEventInput {
  summary: string;
  description?: string;
  startIso: string;
  endIso: string;
  timeZone: string;
  attendeeEmail?: string;
}

export interface CreatedEvent {
  id: string;
  htmlLink?: string;
}

/** Create an event on the professor's primary calendar. */
export async function createCalendarEvent(
  email: string,
  input: CreateEventInput,
): Promise<CreatedEvent> {
  const token = await getProfessorAccessToken(email);
  const body: Record<string, unknown> = {
    summary: input.summary,
    description: input.description,
    start: { dateTime: input.startIso, timeZone: input.timeZone },
    end: { dateTime: input.endIso, timeZone: input.timeZone },
  };
  if (input.attendeeEmail) {
    body.attendees = [{ email: input.attendeeEmail }];
  }

  const response = await fetch(`${EVENTS_ENDPOINT}?sendUpdates=all`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    cache: 'no-store',
  });

  const payload = (await readJson(response)) as { id?: string; htmlLink?: string } | null;
  if (response.status === 401 || response.status === 403) {
    throw new CalendarAuthError(
      'Google Calendar rejected the event. The professor must reconnect the calendar account.',
    );
  }
  if (!response.ok || !payload?.id) {
    throw new CalendarApiError(
      `Google Calendar event creation failed (${response.status}).`,
      response.status,
    );
  }
  return { id: payload.id, htmlLink: payload.htmlLink };
}
