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
  const boot = async (env: Record<string, string> = {}) => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(DatabaseService)
      .useValue({ db: {} })
      .overrideProvider(DATABASE_CLIENT)
      .useValue(drizzle({ client, schema }))
      .compile();
    const booted = moduleRef.createNestApplication<INestApplication<App>>();
    configureHttp(booted, {
      AUTH_TRUSTED_ORIGIN: ADMIN_ORIGIN,
      PUBLIC_ALLOWED_ORIGINS: PUBLIC_ORIGIN,
      ...env,
    });
    await booted.init();
    return booted;
  };
  /** Replaces the default app with one booted from `env`; `afterEach` closes it. */
  const reboot = async (env: Record<string, string>) => {
    await app.close();
    app = await boot(env);
  };
  beforeEach(async () => {
    app = await boot();
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
  const fromClient = (forwardedFor: string) =>
    request(app.getHttpServer()).get(CATALOG).set('X-Forwarded-For', forwardedFor);
  const exhaustLimit = async (forwardedFor: string) => {
    for (let i = 0; i < LIMIT; i += 1) {
      await fromClient(forwardedFor).expect(404);
    }
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

  describe('client address behind proxies (TRUST_PROXY_HOPS)', () => {
    it('without trusted hops, every forwarded client shares the proxy address counter', async () => {
      await exhaustLimit('203.0.113.10');

      await fromClient('198.51.100.20').expect(429);
    });

    it('with one trusted hop, each forwarded client gets its own counter', async () => {
      await reboot({ TRUST_PROXY_HOPS: '1' });
      await exhaustLimit('203.0.113.10');

      await fromClient('203.0.113.10').expect(429);
      await fromClient('198.51.100.20').expect(404);
    });

    it('ignores a forged left-most entry when one hop is trusted', async () => {
      await reboot({ TRUST_PROXY_HOPS: '1' });
      await exhaustLimit('203.0.113.10');

      // The client prepends a fake address; the proxy still appends the real one on the right.
      await fromClient('198.51.100.99, 203.0.113.10').expect(429);
    });

    it('with two trusted hops, reads the client the outer proxy saw', async () => {
      await reboot({ TRUST_PROXY_HOPS: '2' });
      // client (forged prefix) -> Cloudflare (appends the client) -> Railway edge (appends Cloudflare)
      await exhaustLimit('198.51.100.99, 203.0.113.10, 172.64.0.1');

      await fromClient('198.51.100.98, 203.0.113.10, 172.64.0.2').expect(429);
      await fromClient('203.0.113.11, 172.64.0.1').expect(404);
    });
  });

  describe('client address source (CLIENT_IP_SOURCE)', () => {
    const SECRET = 'cloudflare-origin-secret-0123456789';
    // The throttler reads its config from process.env when the app boots.
    const rebootWithSource = async (env: Record<string, string>) => {
      Object.assign(process.env, env);
      await reboot({ TRUST_PROXY_HOPS: '1' });
    };
    afterEach(() => {
      delete process.env.CLIENT_IP_SOURCE;
      delete process.env.CLOUDFLARE_ORIGIN_SECRET;
    });
    const withHeaders = (headers: Record<string, string>) => {
      const call = request(app.getHttpServer()).get(CATALOG);
      for (const [name, value] of Object.entries(headers)) call.set(name, value);
      return call;
    };
    const exhaustWith = async (headers: Record<string, string>) => {
      for (let i = 0; i < LIMIT; i += 1) {
        await withHeaders(headers).expect(404);
      }
    };

    it('with x-real-ip, a forged X-Forwarded-For cannot pick a new counter', async () => {
      await rebootWithSource({ CLIENT_IP_SOURCE: 'x-real-ip' });
      await exhaustWith({ 'X-Real-IP': '203.0.113.10', 'X-Forwarded-For': '198.51.100.1' });

      await withHeaders({ 'X-Real-IP': '203.0.113.10', 'X-Forwarded-For': '198.51.100.2' }).expect(
        429,
      );
      await withHeaders({ 'X-Real-IP': '203.0.113.11', 'X-Forwarded-For': '198.51.100.1' }).expect(
        404,
      );
    });

    it('with cloudflare and the origin secret, counts CF-Connecting-IP', async () => {
      await rebootWithSource({ CLIENT_IP_SOURCE: 'cloudflare', CLOUDFLARE_ORIGIN_SECRET: SECRET });
      const viaCloudflare = (client: string, edge: string) => ({
        'X-Origin-Secret': SECRET,
        'CF-Connecting-IP': client,
        'X-Real-IP': edge,
      });
      await exhaustWith(viaCloudflare('203.0.113.10', '172.64.0.1'));

      await withHeaders(viaCloudflare('203.0.113.10', '172.64.0.2')).expect(429);
      await withHeaders(viaCloudflare('203.0.113.11', '172.64.0.1')).expect(404);
    });

    it('with cloudflare, a request without the secret cannot choose its address', async () => {
      await rebootWithSource({ CLIENT_IP_SOURCE: 'cloudflare', CLOUDFLARE_ORIGIN_SECRET: SECRET });
      // Bypassing Cloudflare: forged CF-Connecting-IP, Railway's X-Real-IP is the real client.
      await exhaustWith({ 'CF-Connecting-IP': '198.51.100.1', 'X-Real-IP': '203.0.113.10' });

      await withHeaders({ 'CF-Connecting-IP': '198.51.100.2', 'X-Real-IP': '203.0.113.10' }).expect(
        429,
      );
      await withHeaders({
        'X-Origin-Secret': 'wrong-secret-wrong-secret-wrong-secret',
        'CF-Connecting-IP': '198.51.100.3',
        'X-Real-IP': '203.0.113.10',
      }).expect(429);
    });

    it('refuses to boot with an unknown source', async () => {
      process.env.CLIENT_IP_SOURCE = 'forwarded';

      await expect(reboot({})).rejects.toThrow(
        'CLIENT_IP_SOURCE must be "request", "x-real-ip" or "cloudflare" (got "forwarded").',
      );
    });
  });
});
