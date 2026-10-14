import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import { applyMigrations } from '@/database/migrations';

jest.setTimeout(120_000);

const migrationsFolder = resolve(__dirname, '../drizzle');
const journal = JSON.parse(
  readFileSync(resolve(migrationsFolder, 'meta/_journal.json'), 'utf8'),
) as {
  entries: unknown[];
};

describe('applyMigrations (e2e)', () => {
  let container: StartedPostgreSqlContainer;

  beforeAll(async () => {
    container = await new PostgreSqlContainer('postgres:16')
      .withDatabase('migrations')
      .withUsername('migrations')
      .withPassword('migrations-password')
      .start();
  });

  afterAll(async () => {
    await container?.stop();
  });

  async function freshDatabase(name: string): Promise<string> {
    const admin = postgres(container.getConnectionUri(), { max: 1 });
    try {
      await admin.unsafe(`CREATE DATABASE ${name}`);
    } finally {
      await admin.end({ timeout: 5 });
    }
    const url = new URL(container.getConnectionUri());
    url.pathname = `/${name}`;
    return url.toString();
  }

  it('applies every migration to an empty database, then nothing on a second run', async () => {
    const url = await freshDatabase('empty_target');

    await expect(applyMigrations(url, migrationsFolder)).resolves.toEqual({
      applied: journal.entries.length,
      total: journal.entries.length,
    });
    await expect(applyMigrations(url, migrationsFolder)).resolves.toEqual({
      applied: 0,
      total: journal.entries.length,
    });

    const client = postgres(url, { max: 1 });
    try {
      const [{ legal }] = await client<{ legal: string | null }[]>`
        SELECT to_regclass('public.registration_legal_acceptances') AS legal
      `;
      expect(legal).toBe('registration_legal_acceptances');
    } finally {
      await client.end({ timeout: 5 });
    }
  });

  it('treats a database migrated by the drizzle migrator as up to date', async () => {
    const url = await freshDatabase('kit_target');
    const client = postgres(url, { max: 1 });
    try {
      await migrate(drizzle(client), { migrationsFolder });
    } finally {
      await client.end({ timeout: 5 });
    }

    await expect(applyMigrations(url, migrationsFolder)).resolves.toEqual({
      applied: 0,
      total: journal.entries.length,
    });
  });

  it('serializes concurrent runs so each migration is applied once', async () => {
    const url = await freshDatabase('concurrent_target');

    const results = await Promise.all([
      applyMigrations(url, migrationsFolder),
      applyMigrations(url, migrationsFolder),
    ]);

    expect(results.map((result) => result.applied).sort((a, b) => a - b)).toEqual([
      0,
      journal.entries.length,
    ]);
  });
});
