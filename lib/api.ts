/**
 * Consistent JSON API helpers.
 *
 * Success responses return the contract object at the top level
 * (e.g. `{ slots: [...] }`, `{ booking: {...} }`, or the dashboard object).
 * Errors always use: `{ error: { code, message, details? } }`.
 */
import { NextResponse } from 'next/server';
import { DbNotConfiguredError } from './db';
import {
  CalendarApiError,
  CalendarAuthError,
  CalendarNotConfiguredError,
} from './google-calendar';

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function json<T>(data: T, status = 200): NextResponse {
  return NextResponse.json(data, { status });
}

export function errorResponse(
  status: number,
  code: string,
  message: string,
  details?: unknown,
): NextResponse {
  const error: { code: string; message: string; details?: unknown } = { code, message };
  if (details !== undefined) error.details = details;
  return NextResponse.json({ error }, { status });
}

export function toErrorResponse(error: unknown): NextResponse {
  if (error instanceof ApiError) {
    return errorResponse(error.status, error.code, error.message, error.details);
  }
  if (error instanceof DbNotConfiguredError) {
    return errorResponse(503, 'DB_NOT_CONFIGURED', error.message);
  }
  if (error instanceof CalendarNotConfiguredError) {
    return errorResponse(503, 'CALENDAR_NOT_CONFIGURED', error.message);
  }
  if (error instanceof CalendarAuthError) {
    return errorResponse(503, 'CALENDAR_AUTH_REQUIRED', error.message);
  }
  if (error instanceof CalendarApiError) {
    return errorResponse(502, 'CALENDAR_API_ERROR', error.message);
  }
  console.error('[api] unhandled error', error);
  return errorResponse(500, 'INTERNAL_ERROR', 'Unexpected server error.');
}

export async function handleRoute(fn: () => Promise<NextResponse>): Promise<NextResponse> {
  try {
    return await fn();
  } catch (error) {
    return toErrorResponse(error);
  }
}
