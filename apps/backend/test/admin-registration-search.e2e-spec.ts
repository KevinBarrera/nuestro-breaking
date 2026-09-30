import { createHash, randomBytes } from 'node:crypto';
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

describe('GET /admin/events/:eventId/participants (e2e)', () => {
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
    const [{ organizationId }] = await client<{ organizationId: string }[]>`
      INSERT INTO organizations (name) VALUES ('Organizer') RETURNING id AS "organizationId"
    `;
    const [event, other] = await client<{ id: string }[]>`
      INSERT INTO events (organization_id, name, time_zone)
      VALUES (${organizationId}, 'Visible event', 'Etc/UTC'),
        (${organizationId}, 'Private event', 'Etc/UTC') RETURNING id
    `;
    const [first, second, third] = await client<{ id: string }[]>`
      INSERT INTO participants (full_name, email, stage_name)
      VALUES ('Alex Rivera', 'alex@example.com', 'Flash'),
        ('Alex Rivera', 'second@example.com', 'Other'),
        ('Hidden Person', 'hidden@example.com', 'Secret') RETURNING id
    `;
    const [one, two, hidden] = await client<{ id: string }[]>`
      INSERT INTO event_registrations (event_id, participant_id, folio, status, confirmation_source, confirmed_at)
      VALUES (${event.id}, ${first.id}, 'F-10', 'confirmed', 'admin_cash', now()),
        (${event.id}, ${second.id}, 'F-11', 'pending_payment', NULL, NULL),
        (${other.id}, ${third.id}, 'F-10', 'pending_payment', NULL, NULL)
      RETURNING id
    `;
    const [{ venueId }] = await client<{ venueId: string }[]>`
      INSERT INTO venues (organization_id, name) VALUES (${organizationId}, 'Hall')
      RETURNING id AS "venueId"
    `;
    await client`
      INSERT INTO event_venues (organization_id, event_id, venue_id)
      VALUES (${organizationId}, ${event.id}, ${venueId}), (${organizationId}, ${other.id}, ${venueId})
    `;
    const [battle, workshop, privateActivity] = await client<{ id: string }[]>`
      INSERT INTO activities (event_id, venue_id, kind, name, starts_at, ends_at)
      VALUES (${event.id}, ${venueId}, 'battle', 'Battle', now(), now() + interval '1 hour'),
        (${event.id}, ${venueId}, 'workshop', 'Workshop', now(), now() + interval '1 hour'),
        (${other.id}, ${venueId}, 'battle', 'Private battle', now(), now() + interval '1 hour')
      RETURNING id
    `;
    await client`
      INSERT INTO event_activity_registrations (event_id, event_registration_id, activity_id)
      VALUES (${event.id}, ${one.id}, ${workshop.id}), (${event.id}, ${one.id}, ${battle.id}),
        (${other.id}, ${hidden.id}, ${privateActivity.id})
    `;
    return { event, other, first, second, one, two, battle, workshop };
  }

  async function session(role = 'admin', eventId: string | null = null) {
    const [{ userId }] = await client<{ userId: string }[]>`
      INSERT INTO users (email, display_name, active)
      VALUES ('operator@example.com', 'Operator', true) RETURNING id AS "userId"
    `;
    await client`
      INSERT INTO user_roles (user_id, role, scope_type, scope_id)
      VALUES (${userId}, ${role}, ${eventId ? 'event' : 'global'}, ${eventId})
    `;
    const token = randomBytes(32).toString('hex');
    await client`
      INSERT INTO auth_sessions (user_id, token_digest, expires_at)
      VALUES (${userId}, ${createHash('sha256').update(token).digest('hex')}, now() + interval '1 hour')
    `;
    return { cookie: `nb_admin_session=${token}`, userId };
  }

  const search = (eventId: string, q: string) =>
    request(app.getHttpServer()).get(`/admin/events/${eventId}/participants`).query({ q });

  it('denies missing, inactive, wrong-role and wrong-event sessions without leaking records', async () => {
    const { event, other } = await fixture();
    const missing = await search(event.id, 'Alex').expect(401);
    const { cookie, userId } = await session('admin', event.id);
    expect((await search(other.id, 'Hidden').set('Cookie', cookie).expect(401)).body).toEqual(
      missing.body,
    );
    await client`UPDATE user_roles SET role = 'dancer' WHERE user_id = ${userId}`;
    expect((await search(event.id, 'Alex').set('Cookie', cookie).expect(401)).body).toEqual(
      missing.body,
    );
    await client`UPDATE user_roles SET role = 'admin' WHERE user_id = ${userId}`;
    await client`UPDATE auth_sessions SET revoked_at = now() WHERE user_id = ${userId}`;
    expect((await search(event.id, 'Alex').set('Cookie', cookie).expect(401)).body).toEqual(
      missing.body,
    );
    expect(JSON.stringify(missing.body)).not.toMatch(/Alex|Hidden|Private/);
  });

  it('searches stored identity and folio fields only in the authorized event, returning minimal summaries', async () => {
    const { event, other, first, second, one, two, battle, workshop } = await fixture();
    const { cookie } = await session();
    const get = (q: string, id = event.id) => search(id, q).set('Cookie', cookie).expect(200);
    const result = await get('alex');
    const page = result.body as { results: unknown[] };
    expect(page).toEqual({
      total: 2,
      limit: 20,
      offset: 0,
      results: [
        {
          participant: {
            id: first.id,
            fullName: 'Alex Rivera',
            email: 'alex@example.com',
            stageName: 'Flash',
          },
          registration: { id: one.id, eventId: event.id, folio: 'F-10', status: 'confirmed' },
          activities: [
            { id: battle.id, name: 'Battle', kind: 'battle' },
            { id: workshop.id, name: 'Workshop', kind: 'workshop' },
          ].sort((a, b) => a.id.localeCompare(b.id)),
        },
        {
          participant: {
            id: second.id,
            fullName: 'Alex Rivera',
            email: 'second@example.com',
            stageName: 'Other',
          },
          registration: { id: two.id, eventId: event.id, folio: 'F-11', status: 'pending_payment' },
          activities: [],
        },
      ],
    });
    for (const q of ['ALEX@EXAMPLE.COM', 'flash', 'f-10']) {
      expect((await get(q)).body as unknown).toEqual({
        ...page,
        total: 1,
        results: [page.results[0]],
      });
    }
    expect((await get('hidden')).body).toEqual({ total: 0, limit: 20, offset: 0, results: [] });
    expect(((await get('F-10', other.id)).body as { results: unknown[] }).results).toHaveLength(1);
    expect(JSON.stringify(result.body)).not.toMatch(
      /Private|admin_cash|confirmedAt|paymentProvider|checkIn|audit/,
    );
  });

  it('bounds pages, validates parameters, and never treats blank or wildcard input as a roster search', async () => {
    const { event } = await fixture();
    const { cookie } = await session();
    const get = (params: { q?: string; limit?: string; offset?: string }) =>
      request(app.getHttpServer())
        .get(`/admin/events/${event.id}/participants`)
        .query(params)
        .set('Cookie', cookie);
    expect((await get({ q: 'Alex', limit: '1', offset: '1' }).expect(200)).body).toMatchObject({
      total: 2,
      limit: 1,
      offset: 1,
      results: [{ participant: { email: 'second@example.com' } }],
    });
    for (const q of ['nobody', '%%', '__']) {
      expect((await get({ q }).expect(200)).body).toEqual({
        total: 0,
        limit: 20,
        offset: 0,
        results: [],
      });
    }
    for (const params of [
      {},
      { q: ' ' },
      { q: 'a' },
      { q: '%' },
      { q: 'Alex', limit: '51' },
      { q: 'Alex', limit: '0' },
      { q: 'Alex', offset: '-1' },
      { q: 'Alex', limit: 'oops' },
    ]) {
      const response = await get(params).expect(400);
      expect(JSON.stringify(response.body)).not.toMatch(/alex@example.com|Hidden Person/);
    }
  });
});
