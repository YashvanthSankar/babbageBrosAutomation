/**
 * PostgreSQL access layer. Server-only.
 *
 * Uses a single shared Pool (cached on globalThis in dev to survive HMR) and
 * always passes parameters positionally ($1, $2, ...) — never string-interpolate
 * user input.
 */
import { Pool, type PoolClient, type QueryResult, type QueryResultRow } from 'pg';
import { isDbConfigured } from './env';

export class DbNotConfiguredError extends Error {
  constructor() {
    super(
      'Database is not configured. Set DATABASE_URL and run db/schema.sql before using this endpoint.',
    );
    this.name = 'DbNotConfiguredError';
  }
}

declare global {
  // eslint-disable-next-line no-var
  var __babbagePgPool: Pool | undefined;
}

function useSsl(): boolean {
  const ssl = (process.env.DATABASE_SSL ?? process.env.PGSSLMODE ?? '').toLowerCase();
  return ssl === 'true' || ssl === 'require';
}

export function getPool(): Pool {
  if (!isDbConfigured()) throw new DbNotConfiguredError();
  if (!global.__babbagePgPool) {
    global.__babbagePgPool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 10,
      idleTimeoutMillis: 30_000,
      ssl: useSsl() ? { rejectUnauthorized: false } : undefined,
    });
  }
  return global.__babbagePgPool;
}

export async function query<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: readonly unknown[] = [],
): Promise<QueryResult<T>> {
  return getPool().query<T>(text, params as unknown[]);
}

/**
 * Run `fn` inside a single transaction on one pooled client.
 * Rolls back on any thrown error and always releases the client.
 */
export async function withTransaction<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {
      /* rollback failure is secondary to the original error */
    }
    throw error;
  } finally {
    client.release();
  }
}
