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

describe('GET /admin/events/:eventId/foundation (e2e)', () => {
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

  beforeEach(async () => {
    await harness.reset();
  });

  afterAll(async () => {
    await app?.close();
    await harness.stop();
  });

  async function session(role = 'admin', scopeType = 'global', scopeId: string | null = null) {
    const [{ id: userId }] = await client<{ id: string }[]>`
      INSERT INTO users (email, display_name, active)
      VALUES ('reader@example.com', 'Reader', true) RETURNING id
    `;
    await client`
      INSERT INTO user_roles (user_id, role, scope_type, scope_id)
      VALUES (${userId}, ${role}, ${scopeType}, ${scopeId})
    `;
    const token = randomBytes(32).toString('hex');
    const digest = createHash('sha256').update(token).digest('hex');
    await client`
      INSERT INTO auth_sessions (user_id, token_digest, expires_at)
      VALUES (${userId}, ${digest}, now() + interval '1 hour')
    `;
    return { cookie: `nb_admin_session=${token}`, userId };
  }

  it('denies missing, malformed, unknown, expired, revoked and suspended sessions without event data', async () => {
    const eventId = '00000000-0000-4000-8000-000000000000';
    const get = (cookie?: string) => {
      const call = request(app.getHttpServer()).get(`/admin/events/${eventId}/foundation`);
      return cookie ? call.set('Cookie', cookie) : call;
    };
    const missing = await get().expect(401);
    const malformed = await get('nb_admin_session=invalid').expect(401);
    const unknown = await get(`nb_admin_session=${'f'.repeat(64)}`).expect(401);
    expect(malformed.body).toEqual(missing.body);
    expect(unknown.body).toEqual(missing.body);
    const { cookie } = await session();
    await client`UPDATE auth_sessions SET expires_at = now() - interval '1 second'`;
    expect((await get(cookie).expect(401)).body).toEqual(missing.body);
    await client`UPDATE auth_sessions SET expires_at = now() + interval '1 hour', revoked_at = now()`;
    expect((await get(cookie).expect(401)).body).toEqual(missing.body);
    await client`UPDATE auth_sessions SET revoked_at = NULL`;
    await client`UPDATE users SET active = false`;
    expect((await get(cookie).expect(401)).body).toEqual(missing.body);
  });

  it.each(['admin', 'judge'])(
    'allows a global %s role and only matching event scope',
    async (role) => {
      const eventId = '00000000-0000-4000-8000-000000000001';
      const otherId = '00000000-0000-4000-8000-000000000002';
      const [{ organizationId }] = await client<{ organizationId: string }[]>`
        INSERT INTO organizations (name) VALUES ('Organizer') RETURNING id AS "organizationId"
      `;
      await client`
        INSERT INTO events (id, organization_id, name, time_zone)
        VALUES (${eventId}, ${organizationId}, 'Visible', 'Etc/UTC'),
               (${otherId}, ${organizationId}, 'Hidden', 'Etc/UTC')
      `;
      const { cookie, userId } = await session(role);
      const get = (id: string) =>
        request(app.getHttpServer()).get(`/admin/events/${id}/foundation`).set('Cookie', cookie);
      const global = await get(eventId).expect(200);
      expect((global.body as { event: { name: string } }).event.name).toBe('Visible');
      await client`UPDATE user_roles SET scope_type = 'event', scope_id = ${eventId} WHERE user_id = ${userId}`;
      expect((await get(eventId).expect(200)).body).toEqual(global.body);
      const denied = await get(otherId).expect(401);
      expect(JSON.stringify(denied.body)).not.toContain('Hidden');
      await client`UPDATE user_roles SET scope_type = 'organization', scope_id = ${organizationId} WHERE user_id = ${userId}`;
      expect((await get(eventId).expect(401)).body).toEqual(denied.body);
      await client`UPDATE user_roles SET scope_type = 'global', scope_id = NULL, active = false WHERE user_id = ${userId}`;
      expect((await get(eventId).expect(401)).body).toEqual(denied.body);
      await client`UPDATE user_roles SET revoked_at = now() WHERE user_id = ${userId}`;
      expect((await get(eventId).expect(401)).body).toEqual(denied.body);
    },
  );

  it('denies an authenticated non-admin role with the same safe response', async () => {
    const eventId = '00000000-0000-4000-8000-000000000000';
    const missing = await request(app.getHttpServer())
      .get(`/admin/events/${eventId}/foundation`)
      .expect(401);
    const { cookie } = await session('dancer');
    const denied = await request(app.getHttpServer())
      .get(`/admin/events/${eventId}/foundation`)
      .set('Cookie', cookie)
      .expect(401);
    expect(denied.body).toEqual(missing.body);
  });

  it('returns only the requested bounded event, its attached venues and draft activities', async () => {
    const { cookie } = await session();
    const [{ organizationId }] = await client<{ organizationId: string }[]>`
      INSERT INTO organizations (name) VALUES ('Organizer') RETURNING id AS "organizationId"
    `;
    const [event, otherEvent] = await client<{ id: string }[]>`
      INSERT INTO events (organization_id, name, time_zone, starts_at, ends_at)
      VALUES
        (${organizationId}, 'Weekend', 'America/Bogota',
          TIMESTAMPTZ '2026-11-14 14:00:00+00', TIMESTAMPTZ '2026-11-16 01:00:00+00'),
        (${organizationId}, 'Other event', 'Etc/UTC', NULL, NULL)
      RETURNING id
    `;
    const [main, extra, unattached] = await client<{ id: string }[]>`
      INSERT INTO venues (organization_id, name)
      VALUES (${organizationId}, 'Main'), (${organizationId}, 'Extra'), (${organizationId}, 'Unattached')
      RETURNING id
    `;
    await client`
      INSERT INTO event_venues (organization_id, event_id, venue_id)
      VALUES (${organizationId}, ${event.id}, ${extra.id}),
             (${organizationId}, ${event.id}, ${main.id}),
             (${organizationId}, ${otherEvent.id}, ${unattached.id})
    `;
    const [later, earlier] = await client<{ id: string }[]>`
      INSERT INTO activities (event_id, venue_id, name, kind, starts_at, ends_at)
      VALUES
        (${event.id}, ${extra.id}, 'Later', 'workshop',
          TIMESTAMPTZ '2026-11-15 15:00:00+00', TIMESTAMPTZ '2026-11-15 16:00:00+00'),
        (${event.id}, ${main.id}, 'Earlier', 'battle',
          TIMESTAMPTZ '2026-11-14 15:00:00+00', TIMESTAMPTZ '2026-11-14 17:00:00+00')
      RETURNING id
    `;
    await client`
      INSERT INTO activities (event_id, venue_id, name, kind, starts_at, ends_at)
      VALUES (${otherEvent.id}, ${unattached.id}, 'Private', 'social',
        TIMESTAMPTZ '2026-11-14 15:00:00+00', TIMESTAMPTZ '2026-11-14 16:00:00+00')
    `;

    const response = await request(app.getHttpServer())
      .get(`/admin/events/${event.id}/foundation`)
      .set('Cookie', cookie)
      .expect(200);
    expect(response.body).toEqual({
      event: {
        id: event.id,
        name: 'Weekend',
        timeZone: 'America/Bogota',
        startsAt: '2026-11-14T14:00:00.000Z',
        endsAt: '2026-11-16T01:00:00.000Z',
        windowStatus: 'bounded',
      },
      venues: [
        { id: extra.id, name: 'Extra' },
        { id: main.id, name: 'Main' },
      ].sort((a, b) => a.id.localeCompare(b.id)),
      activities: [
        {
          id: earlier.id,
          name: 'Earlier',
          kind: 'battle',
          venueId: main.id,
          startsAt: '2026-11-14T15:00:00.000Z',
          endsAt: '2026-11-14T17:00:00.000Z',
          planningStatus: 'draft',
        },
        {
          id: later.id,
          name: 'Later',
          kind: 'workshop',
          venueId: extra.id,
          startsAt: '2026-11-15T15:00:00.000Z',
          endsAt: '2026-11-15T16:00:00.000Z',
          planningStatus: 'draft',
        },
      ],
      deferredFields: ['priceDisplay', 'capacity', 'registrationRequirements'],
    });
  });

  it('returns an unbounded event with empty collections, and 404 for a missing event', async () => {
    const { cookie } = await session();
    const [{ organizationId }] = await client<{ organizationId: string }[]>`
      INSERT INTO organizations (name) VALUES ('Organizer') RETURNING id AS "organizationId"
    `;
    const [{ id }] = await client<{ id: string }[]>`
      INSERT INTO events (organization_id, name, time_zone)
      VALUES (${organizationId}, 'Open', 'Etc/UTC') RETURNING id
    `;
    const response = await request(app.getHttpServer())
      .get(`/admin/events/${id}/foundation`)
      .set('Cookie', cookie)
      .expect(200);
    expect(response.body).toEqual({
      event: {
        id,
        name: 'Open',
        timeZone: 'Etc/UTC',
        startsAt: null,
        endsAt: null,
        windowStatus: 'unbounded',
      },
      venues: [],
      activities: [],
      deferredFields: ['priceDisplay', 'capacity', 'registrationRequirements'],
    });
    await request(app.getHttpServer())
      .get('/admin/events/00000000-0000-4000-8000-000000000000/foundation')
      .set('Cookie', cookie)
      .expect(404);
  });
});
