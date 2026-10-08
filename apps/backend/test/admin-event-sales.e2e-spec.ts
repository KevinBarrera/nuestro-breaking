import { createHash, randomBytes, randomUUID } from 'node:crypto';
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
import { PostgresHarness } from './support/postgres-harness';

jest.setTimeout(120_000);

type SalesRow = {
  slug: string;
  sales_enabled: boolean;
  sales_opens_at: Date | null;
  sales_closes_at: Date | null;
};

const DAY = 24 * 60 * 60 * 1000;
const fromNow = (ms: number) => new Date(Date.now() + ms).toISOString();

describe('admin event sales (e2e)', () => {
  const harness = new PostgresHarness();
  let client: Sql;
  let app: INestApplication<App>;
  beforeAll(async () => {
    client = await harness.start();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(DatabaseService)
      .useValue({ db: {} })
      .overrideProvider(DATABASE_CLIENT)
      .useValue(drizzle({ client, schema }))
      .compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });
  beforeEach(async () => harness.reset());
  afterAll(async () => {
    await app?.close();
    await harness.stop();
  });

  async function fixture() {
    const [{ id: org }] = await client<
      { id: string }[]
    >`INSERT INTO organizations (name) VALUES ('Org') RETURNING id`;
    const [event, other] = await client<{ id: string }[]>`
      INSERT INTO events (organization_id, name, time_zone, slug)
      VALUES (${org}, 'One', 'Etc/UTC', 'event-one'), (${org}, 'Two', 'Etc/UTC', 'event-two')
      RETURNING id`;
    return { event: event.id, other: other.id };
  }
  async function session(role: string, eventId: string | null) {
    const [{ id: userId }] = await client<
      { id: string }[]
    >`INSERT INTO users (email, display_name, active) VALUES (${randomBytes(8).toString('hex') + '@example.com'}, 'Operator', true) RETURNING id`;
    await client`INSERT INTO user_roles (user_id, role, scope_type, scope_id)
      VALUES (${userId}, ${role}, ${eventId ? 'event' : 'global'}, ${eventId})`;
    const token = randomBytes(32).toString('hex');
    await client`INSERT INTO auth_sessions (user_id, token_digest, expires_at)
      VALUES (${userId}, ${createHash('sha256').update(token).digest('hex')}, now() + interval '1 hour')`;
    return `nb_admin_session=${token}`;
  }
  const trustedOrigin = process.env.AUTH_TRUSTED_ORIGIN ?? 'http://localhost:5173';
  const headers = (cookie: string) => ({
    Cookie: cookie,
    Origin: trustedOrigin,
    'X-CSRF-Token': createHash('sha256')
      .update(`nb-admin-csrf-v1:${cookie.slice('nb_admin_session='.length)}`)
      .digest('hex'),
  });
  const server = () => request(app.getHttpServer());
  const read = (event: string) => server().get(`/admin/events/${event}/sales`);
  const write = (event: string) => server().put(`/admin/events/${event}/sales`);
  // The harness client returns timestamptz as text; read them as ISO strings and compare as dates.
  async function row(event: string): Promise<SalesRow> {
    const [found] = await client<
      (Omit<SalesRow, 'sales_opens_at' | 'sales_closes_at'> & {
        opens_at: string | null;
        closes_at: string | null;
      })[]
    >`SELECT slug, sales_enabled, to_json(sales_opens_at) #>> '{}' AS opens_at,
        to_json(sales_closes_at) #>> '{}' AS closes_at FROM events WHERE id = ${event}`;
    const { opens_at, closes_at, ...rest } = found;
    return {
      ...rest,
      sales_opens_at: opens_at ? new Date(opens_at) : null,
      sales_closes_at: closes_at ? new Date(closes_at) : null,
    };
  }

  it('reads the default closed state with the event slug', async () => {
    const { event } = await fixture();
    const cookie = await session('admin', event);
    const response = await read(event).set('Cookie', cookie).expect(200);
    expect(response.body).toEqual({
      slug: 'event-one',
      salesEnabled: false,
      salesOpensAt: null,
      salesClosesAt: null,
      state: 'closed',
      reason: 'disabled',
    });
  });

  it('gives events inserted without a slug a generated kebab-case slug', async () => {
    const [{ id: org }] = await client<
      { id: string }[]
    >`INSERT INTO organizations (name) VALUES ('Org') RETURNING id`;
    const [{ slug }] = await client<{ slug: string }[]>`
      INSERT INTO events (organization_id, name, time_zone) VALUES (${org}, 'Three', 'Etc/UTC')
      RETURNING slug`;
    expect(slug).toMatch(/^event-[0-9a-f]{32}$/);
    await expect(
      client`UPDATE events SET slug = 'Not Kebab' WHERE slug = ${slug}`,
    ).rejects.toMatchObject({ constraint_name: 'events_slug_ck' });
  });

  it('opens sales and reports the state from the saved dates', async () => {
    const { event, other } = await fixture();
    const cookie = await session('admin', event);
    const opensAt = fromNow(-DAY);
    const closesAt = fromNow(DAY);
    const response = await write(event)
      .set(headers(cookie))
      .send({ salesEnabled: true, salesOpensAt: opensAt, salesClosesAt: closesAt })
      .expect(200);
    const expected = {
      slug: 'event-one',
      salesEnabled: true,
      salesOpensAt: opensAt,
      salesClosesAt: closesAt,
      state: 'open',
      reason: null,
    };
    expect(response.body).toEqual(expected);
    expect((await read(event).set('Cookie', cookie).expect(200)).body).toEqual(expected);
    expect(await row(event)).toEqual({
      slug: 'event-one',
      sales_enabled: true,
      sales_opens_at: new Date(opensAt),
      sales_closes_at: new Date(closesAt),
    });
    expect((await row(other)).sales_enabled).toBe(false);
  });

  it('reports not yet open, ended and disabled from the dates and the switch', async () => {
    const { event } = await fixture();
    const cookie = await session('admin', event);
    const cases = [
      [{ salesEnabled: true, salesOpensAt: fromNow(DAY), salesClosesAt: null }, 'not_yet_open'],
      [{ salesEnabled: true, salesOpensAt: null, salesClosesAt: fromNow(-DAY) }, 'ended'],
      [{ salesEnabled: false, salesOpensAt: fromNow(-DAY), salesClosesAt: null }, 'disabled'],
    ] as const;
    for (const [body, reason] of cases) {
      const response = await write(event).set(headers(cookie)).send(body).expect(200);
      expect(response.body).toMatchObject({ ...body, state: 'closed', reason });
    }
    const cleared = await write(event)
      .set(headers(cookie))
      .send({ salesEnabled: true, salesOpensAt: null, salesClosesAt: null })
      .expect(200);
    expect(cleared.body).toMatchObject({ salesOpensAt: null, salesClosesAt: null, state: 'open' });
  });

  it('rejects invalid bodies and windows with 400 and writes nothing', async () => {
    const { event } = await fixture();
    const cookie = await session('admin', event);
    const at = fromNow(DAY);
    const invalid: unknown[] = [
      null,
      [],
      {},
      { salesEnabled: 'true', salesOpensAt: null, salesClosesAt: null },
      { salesEnabled: true, salesClosesAt: null },
      { salesEnabled: true, salesOpensAt: null },
      { salesEnabled: true, salesOpensAt: 'tomorrow', salesClosesAt: null },
      { salesEnabled: true, salesOpensAt: '2026-11-01', salesClosesAt: null },
      { salesEnabled: true, salesOpensAt: '2026-13-01T00:00:00Z', salesClosesAt: null },
      { salesEnabled: true, salesOpensAt: '2026-02-31T10:00:00Z', salesClosesAt: null },
      { salesEnabled: true, salesOpensAt: null, salesClosesAt: '2026-11-20T24:00:00-05:00' },
      { salesEnabled: true, salesOpensAt: 1785000000000, salesClosesAt: null },
      { salesEnabled: true, salesOpensAt: at, salesClosesAt: at },
      { salesEnabled: true, salesOpensAt: fromNow(2 * DAY), salesClosesAt: at },
      { salesEnabled: true, salesOpensAt: null, salesClosesAt: null, slug: 'new-slug' },
    ];
    for (const body of invalid) {
      await write(event)
        .set(headers(cookie))
        .set('Content-Type', 'application/json')
        .send(JSON.stringify(body))
        .expect(400);
    }
    expect(await row(event)).toEqual({
      slug: 'event-one',
      sales_enabled: false,
      sales_opens_at: null,
      sales_closes_at: null,
    });
  });

  it('returns 404 for an unknown event', async () => {
    await fixture();
    const cookie = await session('admin', null);
    const unknown = randomUUID();
    await read(unknown).set('Cookie', cookie).expect(404);
    await write(unknown)
      .set(headers(cookie))
      .send({ salesEnabled: true, salesOpensAt: null, salesClosesAt: null })
      .expect(404);
  });

  it('requires an admin session for this event to read', async () => {
    const { event, other } = await fixture();
    const judge = await session('judge', event);
    const otherAdmin = await session('admin', other);
    await read(event).expect(401);
    await read(event).set('Cookie', judge).expect(401);
    await read(event).set('Cookie', otherAdmin).expect(401);
  });

  it('requires an admin session, trusted origin and CSRF token to write', async () => {
    const { event, other } = await fixture();
    const admin = await session('admin', event);
    const judge = await session('judge', event);
    const otherAdmin = await session('admin', other);
    const body = { salesEnabled: true, salesOpensAt: null, salesClosesAt: null };
    const command = () => write(event).send(body);
    await command().set('Origin', trustedOrigin).expect(401);
    await command().set(headers(judge)).expect(401);
    await command().set(headers(otherAdmin)).expect(401);
    await command()
      .set('Cookie', admin)
      .set('X-CSRF-Token', headers(admin)['X-CSRF-Token'])
      .expect(403);
    await command().set(headers(admin)).set('Origin', 'https://evil.example').expect(403);
    await command().set('Cookie', admin).set('Origin', trustedOrigin).expect(403);
    await command().set(headers(admin)).set('X-CSRF-Token', '0'.repeat(64)).expect(403);
    expect((await row(event)).sales_enabled).toBe(false);
  });
});
