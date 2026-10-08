/**
 * GET /api/health
 *
 * Reports process and database readiness. Returns 503 when PostgreSQL is
 * unreachable or unconfigured.
 */
import type { NextResponse } from 'next/server';
import { errorResponse, json } from '@/lib/api';
import { query } from '@/lib/db';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(): Promise<NextResponse> {
  try {
    await query('SELECT 1');
    return json({ status: 'ok', database: 'connected', timestamp: new Date().toISOString() });
  } catch {
    return errorResponse(
      503,
      'DATABASE_UNAVAILABLE',
      'The API is running but the database is unavailable.',
    );
  }
}
