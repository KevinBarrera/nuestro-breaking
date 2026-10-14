import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { drizzle } from 'drizzle-orm/postgres-js';
import { type Sql } from 'postgres';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '@/app.module';
import { DATABASE_CLIENT } from '@/database/database.constants';
import * as schema from '@/database/schema';
import { DatabaseService } from '@/database/database.service';
import { configureHttp } from '@/http';
import { PostgresHarness } from './support/postgres-harness';

jest.setTimeout(120_000);

describe('GET /health (e2e)', () => {
  const harness = new PostgresHarness();
  let app: INestApplication<App>;

  beforeAll(async () => {
    const client: Sql = await harness.start();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(DatabaseService)
      .useValue({ db: {} })
      .overrideProvider(DATABASE_CLIENT)
      .useValue(drizzle({ client, schema }))
      .compile();
    app = moduleRef.createNestApplication();
    configureHttp(app);
    await app.init();
  });
  afterAll(async () => {
    await app?.close();
    await harness.stop();
  });

  it('answers ok when the database is reachable, without a session or rate limit', async () => {
    for (let i = 0; i < 3; i += 1) {
      const response = await request(app.getHttpServer()).get('/health').expect(200);

      expect(response.body).toEqual({ status: 'ok' });
      expect(response.headers['x-ratelimit-limit']).toBeUndefined();
    }
  });
});
