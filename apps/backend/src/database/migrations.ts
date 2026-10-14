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
      await client`select pg_advisory_unlock(${MIGRATION_LOCK_KEY})`;
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
