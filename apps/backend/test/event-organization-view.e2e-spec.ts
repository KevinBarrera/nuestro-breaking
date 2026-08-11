import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { execFile } from 'node:child_process';
import { resolve } from 'node:path';
import { promisify } from 'node:util';
import { drizzle } from 'drizzle-orm/postgres-js';
import { type Sql } from 'postgres';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '@/app.module';
import { DatabaseService } from '@/database/database.service';
import * as schema from '@/database/schema';
import {
  LOCAL_SEED_IDS,
  seedLocalDatabase,
} from '@/modules/event-organization/infrastructure/local-seed';
import { PostgresHarness } from './support/postgres-harness';

jest.setTimeout(120_000);
const executeFile = promisify(execFile);

describe('Event organization view (e2e)', () => {
  const harness = new PostgresHarness();
  let client: Sql;
  let app: INestApplication<App>;

  beforeAll(async () => {
    client = await harness.start();
  });

  beforeEach(async () => {
    await harness.reset();
    const database = drizzle(client, { schema });
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(DatabaseService)
      .useValue({ db: database })
      .compile();
    app = module.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  afterAll(async () => {
    await harness.stop();
  });

  it('returns organization, event, venue, and schedule for its scoped rows', async () => {
    const scope = await insertScope('a');

    const response = await request(app.getHttpServer())
      .get(`/organizations/${scope.organizationId}/events`)
      .expect(200);

    expect(response.body).toEqual({
      organization: { id: scope.organizationId, name: 'Organization a' },
      events: [
        {
          id: scope.eventId,
          name: 'Event a',
          venue: { id: scope.venueId, name: 'Venue a' },
          lifecycle: 'draft',
          schedule: { startsAt: '2026-06-10T15:30:00.000Z', endsAt: null },
        },
      ],
    });
  });

  it('excludes another organization event from the requested organization response', async () => {
    const requested = await insertScope('a');
    const excluded = await insertScope('b');

    const response = await request(app.getHttpServer())
      .get(`/organizations/${requested.organizationId}/events`)
      .expect(200);

    const view = response.body as { events: Array<{ id: string }> };
    expect(view.events).toHaveLength(1);
    expect(view.events[0].id).toBe(requested.eventId);
    expect(view.events.map((event) => event.id)).not.toContain(excluded.eventId);
  });

  it('upserts the fixed local seed without duplicate events', async () => {
    await seedLocalDatabase(client);
    await seedLocalDatabase(client);

    const [event] = await client`
      SELECT id, organization_id, venue_id, name, lifecycle
      FROM events
      WHERE id = ${LOCAL_SEED_IDS.eventId}
    `;
    const [count] = await client`
      SELECT count(*)::int AS value
      FROM events
      WHERE id = ${LOCAL_SEED_IDS.eventId}
    `;

    expect(event).toEqual({
      id: LOCAL_SEED_IDS.eventId,
      organization_id: LOCAL_SEED_IDS.organizationId,
      venue_id: LOCAL_SEED_IDS.venueId,
      name: 'Local Breaking Jam',
      lifecycle: 'draft',
    });
    expect(count.value).toBe(1);
  });

  it('requires opt-in when the local seed script executes', async () => {
    await expect(
      executeFile(
        process.execPath,
        ['-r', 'ts-node/register/transpile-only', 'scripts/seed-local.ts'],
        {
          cwd: resolve(__dirname, '..'),
          env: {
            ...process.env,
            DATABASE_URL: 'postgresql://user:pass@localhost:5432/local',
            LOCAL_SEED: '0',
          },
        },
      ),
    ).rejects.toThrow('LOCAL_SEED=1 is required.');
  });

  async function insertScope(suffix: string) {
    const suffixNumber = suffix === 'a' ? '1' : '2';
    const ids = {
      userId: `00000000-0000-0000-0000-00000000000${suffixNumber}`,
      organizationId: `10000000-0000-0000-0000-00000000000${suffixNumber}`,
      venueId: `20000000-0000-0000-0000-00000000000${suffixNumber}`,
      eventId: `30000000-0000-0000-0000-00000000000${suffixNumber}`,
    };
    await client`INSERT INTO users (id, email) VALUES (${ids.userId}, ${`organizer-${suffix}@example.com`})`;
    await client`INSERT INTO organizations (id, name) VALUES (${ids.organizationId}, ${`Organization ${suffix}`})`;
    await client`INSERT INTO venues (id, organization_id, name) VALUES (${ids.venueId}, ${ids.organizationId}, ${`Venue ${suffix}`})`;
    await client`INSERT INTO events (id, organization_id, organizer_user_id, venue_id, name, starts_at) VALUES (${ids.eventId}, ${ids.organizationId}, ${ids.userId}, ${ids.venueId}, ${`Event ${suffix}`}, '2026-06-10T09:30:00-06:00')`;
    return ids;
  }
});
