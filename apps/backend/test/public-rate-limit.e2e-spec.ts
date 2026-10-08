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

const ADMIN_ORIGIN = 'https://admin.example';
const PUBLIC_ORIGIN = 'https://tickets.example';
const LIMIT = 3;
const CATALOG = '/public/events/unknown-event/catalog';
const ADMIN_ROUTE = '/admin/events/00000000-0000-0000-0000-000000000000/sales';

describe('public rate limit and CORS (e2e)', () => {
  const harness = new PostgresHarness();
  let client: Sql;
  let app: INestApplication<App>;

  beforeAll(async () => {
    // Read when the app boots (throttler factory, configureHttp), so set before compiling.
    process.env.PUBLIC_RATE_LIMIT_LIMIT = String(LIMIT);
    process.env.PUBLIC_RATE_LIMIT_TTL_MS = '60000';
    client = await harness.start();
  });
  // A fresh app per test gives each test fresh in-memory throttler counters.
  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(DatabaseService)
      .useValue({ db: {} })
      .overrideProvider(DATABASE_CLIENT)
      .useValue(drizzle({ client, schema }))
      .compile();
    app = moduleRef.createNestApplication();
    configureHttp(app, {
      AUTH_TRUSTED_ORIGIN: ADMIN_ORIGIN,
      PUBLIC_ALLOWED_ORIGINS: PUBLIC_ORIGIN,
    });
    await app.init();
  });
  afterEach(async () => app?.close());
  afterAll(async () => {
    delete process.env.PUBLIC_RATE_LIMIT_LIMIT;
    delete process.env.PUBLIC_RATE_LIMIT_TTL_MS;
    await harness.stop();
  });

  const get = (path: string, origin?: string) => {
    const call = request(app.getHttpServer()).get(path);
    return origin ? call.set('Origin', origin) : call;
  };

  it('answers 429 with Retry-After once a client exceeds the public limit', async () => {
    for (let i = 0; i < LIMIT; i += 1) {
      await get(CATALOG).expect(404);
    }

    const response = await get(CATALOG).expect(429);

    expect(response.body).toMatchObject({ statusCode: 429 });
    expect(Number(response.headers['retry-after'])).toBeGreaterThan(0);
  });

  it('does not throttle admin routes', async () => {
    for (let i = 0; i < LIMIT * 3; i += 1) {
      const response = await get(ADMIN_ROUTE);
      expect(response.status).not.toBe(429);
      expect(response.headers['retry-after']).toBeUndefined();
    }
  });

  it('allows a configured public origin on public routes without credentials', async () => {
    const response = await get(CATALOG, PUBLIC_ORIGIN).expect(404);

    expect(response.headers['access-control-allow-origin']).toBe(PUBLIC_ORIGIN);
    expect(response.headers['access-control-allow-credentials']).toBeUndefined();
    expect(response.headers['access-control-expose-headers']).toBeUndefined();
    expect(response.headers.vary).toMatch(/Origin/);
  });

  it('answers a public preflight from a configured origin without credentials', async () => {
    const response = await request(app.getHttpServer())
      .options(CATALOG)
      .set('Origin', PUBLIC_ORIGIN)
      .set('Access-Control-Request-Method', 'GET')
      .expect(204);

    expect(response.headers['access-control-allow-origin']).toBe(PUBLIC_ORIGIN);
    expect(response.headers['access-control-allow-credentials']).toBeUndefined();
  });

  it('also allows the admin origin on public routes, still without credentials', async () => {
    const response = await get(CATALOG, ADMIN_ORIGIN).expect(404);

    expect(response.headers['access-control-allow-origin']).toBe(ADMIN_ORIGIN);
    expect(response.headers['access-control-allow-credentials']).toBeUndefined();
  });

  it('sends no CORS allow headers to an unknown origin on public routes', async () => {
    const response = await get(CATALOG, 'https://evil.example').expect(404);

    expect(response.headers['access-control-allow-origin']).toBeUndefined();
    expect(response.headers['access-control-allow-credentials']).toBeUndefined();
  });

  it('keeps admin routes on the admin origin with credentials and the CSRF header', async () => {
    const admin = await get(ADMIN_ROUTE, ADMIN_ORIGIN);

    expect(admin.headers['access-control-allow-origin']).toBe(ADMIN_ORIGIN);
    expect(admin.headers['access-control-allow-credentials']).toBe('true');
    expect(admin.headers['access-control-expose-headers']).toBe('X-CSRF-Token');

    // A public origin never gains access to admin routes.
    const fromPublic = await get(ADMIN_ROUTE, PUBLIC_ORIGIN);
    expect(fromPublic.headers['access-control-allow-origin']).toBe(ADMIN_ORIGIN);
  });
});
