import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { getDatabaseUrl } from '@/database/environment';
import * as schema from '@/database/schema';

@Injectable()
export class DatabaseService implements OnModuleInit, OnModuleDestroy {
  private readonly client = postgres(getDatabaseUrl());
  readonly db = drizzle({ client: this.client, schema });

  async onModuleInit(): Promise<void> {
    await this.client`select 1`;
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.end({ timeout: 5 });
  }
}
