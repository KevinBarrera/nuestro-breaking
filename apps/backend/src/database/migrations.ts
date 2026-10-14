import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres, { type Sql } from 'postgres';

/** Any fixed key works; it only has to be the same for every migration run. */
const MIGRATION_LOCK_KEY = 238_000_001;

export interface MigrationResult {
  applied: number;
  total: number;
}

/**
 * Walks up from `startDirectory` to the backend's `drizzle` folder, so the same code finds it from
 * `src`, `scripts` and the compiled `dist/scripts`.
 */
export function findMigrationsFolder(startDirectory: string): string {
  let directory = resolve(startDirectory);

  while (true) {
    const candidate = join(directory, 'drizzle');
    if (existsSync(join(candidate, 'meta', '_journal.json'))) {
      return candidate;
    }

    const parentDirectory = dirname(directory);
    if (parentDirectory === directory) {
      throw new Error(`No drizzle/meta/_journal.json found above ${startDirectory}.`);
    }

    directory = parentDirectory;
  }
}

/**
 * Applies pending migrations with the drizzle-orm migrator, which shares the
 * `drizzle.__drizzle_migrations` journal with `drizzle-kit migrate`. A session advisory lock
 * serializes overlapping deploys, so each migration runs once.
 */
export async function applyMigrations(
  databaseUrl: string,
  migrationsFolder: string,
): Promise<MigrationResult> {
  const client = postgres(databaseUrl, { max: 1, onnotice: () => undefined });

  try {
    await client`select pg_advisory_lock(${MIGRATION_LOCK_KEY})`;
    try {
      const before = await countAppliedMigrations(client);
      await migrate(drizzle({ client }), { migrationsFolder });
      const total = await countAppliedMigrations(client);
      return { applied: total - before, total };
    } finally {
      // Closing the connection releases a session lock anyway, so an unlock error must not
      // replace the migration result or the original error.
      await client`select pg_advisory_unlock(${MIGRATION_LOCK_KEY})`.catch(() => undefined);
    }
  } finally {
    await client.end({ timeout: 5 });
  }
}

async function countAppliedMigrations(client: Sql): Promise<number> {
  const [{ journal }] = await client<{ journal: string | null }[]>`
    select to_regclass('drizzle.__drizzle_migrations')::text as journal
  `;
  if (!journal) return 0;

  const [{ count }] = await client<{ count: number }[]>`
    select count(*)::int as count from drizzle.__drizzle_migrations
  `;
  return count;
}

/**
 * One line an operator can act on: the PostgreSQL or socket code and the underlying message. The
 * migrator wraps database errors in a query error whose message is the SQL, and Node reports a
 * refused connection as an `AggregateError` with an empty message, so both are unwrapped. Driver
 * messages carry no connection URL or password.
 */
export function describeMigrationError(error: unknown): string {
  const cause = rootCause(error);
  if (!isErrorLike(cause)) return 'unknown error';

  const code =
    typeof cause.code === 'string' || typeof cause.code === 'number' ? `[${cause.code}] ` : '';
  const message = cause.message.split('\n')[0].trim() || 'no message';
  return `${code}${message}`;
}

interface ErrorLike {
  message: string;
  code?: unknown;
  cause?: unknown;
  errors?: unknown;
}

/** Checks the shape, not the class: Node and test runners can create errors in another realm. */
function isErrorLike(value: unknown): value is ErrorLike {
  return (
    typeof value === 'object' && value !== null && typeof (value as ErrorLike).message === 'string'
  );
}

function rootCause(error: unknown): unknown {
  let current = error;
  for (let depth = 0; depth < 5 && isErrorLike(current); depth += 1) {
    if (Array.isArray(current.errors) && current.errors.length > 0) {
      current = current.errors[0];
    } else if (current.cause !== undefined) {
      current = current.cause;
    } else {
      break;
    }
  }
  return current;
}
