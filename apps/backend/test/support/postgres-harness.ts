import { resolve } from 'node:path';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres, { type Sql } from 'postgres';
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';

const migrationsFolder = resolve(__dirname, '../../drizzle');

export class PostgresHarness {
  private container?: StartedPostgreSqlContainer;
  private client?: Sql;

  async start(): Promise<Sql> {
    this.container = await new PostgreSqlContainer('postgres:16')
      .withDatabase('harness')
      .withUsername('harness')
      .withPassword('harness-password')
      .start();
    this.client = postgres(this.container.getConnectionUri());

    await this.applyMigrations();

    return this.client;
  }

  async reset(): Promise<void> {
    const client = this.getClient();

    await client.unsafe('DROP SCHEMA public CASCADE');
    await client.unsafe('DROP SCHEMA drizzle CASCADE');
    await client.unsafe('CREATE SCHEMA public');
    await this.applyMigrations();
  }

  async stop(): Promise<void> {
    const client = this.client;
    const container = this.container;

    this.client = undefined;
    this.container = undefined;

    try {
      await client?.end({ timeout: 5 });
    } finally {
      await container?.stop();
    }
  }

  private async applyMigrations(): Promise<void> {
    await migrate(drizzle(this.getClient()), { migrationsFolder });
  }

  private getClient(): Sql {
    if (!this.client) {
      throw new Error('PostgresHarness has not been started.');
    }

    return this.client;
  }
}
