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

  it('returns only the requested bounded event, its attached venues and draft activities', async () => {
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
    const [{ organizationId }] = await client<{ organizationId: string }[]>`
      INSERT INTO organizations (name) VALUES ('Organizer') RETURNING id AS "organizationId"
    `;
    const [{ id }] = await client<{ id: string }[]>`
      INSERT INTO events (organization_id, name, time_zone)
      VALUES (${organizationId}, 'Open', 'Etc/UTC') RETURNING id
    `;
    const response = await request(app.getHttpServer())
      .get(`/admin/events/${id}/foundation`)
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
      .expect(404);
  });
});
