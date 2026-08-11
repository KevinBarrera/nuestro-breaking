import { Sql } from 'postgres';
import { PostgresHarness } from './support/postgres-harness';

jest.setTimeout(120_000);

describe('Event organization persistence (e2e)', () => {
  const harness = new PostgresHarness();
  let client: Sql;

  beforeAll(async () => {
    client = await harness.start();
  });

  beforeEach(async () => {
    await harness.reset();
  });

  afterAll(async () => {
    await harness.stop();
  });

  it('applies the organization, named venue, and published event migration', async () => {
    const tables = await client<{ tableName: string }[]>`
      SELECT table_name AS "tableName"
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name
    `;
    expect(tables.map(({ tableName }) => tableName)).toEqual([
      'events',
      'organizations',
      'users',
      'venues',
    ]);

    const [{ userId }] = await client<{ userId: string }[]>`
      INSERT INTO users (email, display_name)
      VALUES ('organizer@example.com', 'Organizer')
      RETURNING id AS "userId"
    `;
    const [{ organizationId }] = await client<{ organizationId: string }[]>`
      INSERT INTO organizations (name)
      VALUES ('Breaking Collective')
      RETURNING id AS "organizationId"
    `;
    const [{ venueId }] = await client<{ venueId: string }[]>`
      INSERT INTO venues (organization_id, name)
      VALUES (${organizationId}, 'Centro Cultural')
      RETURNING id AS "venueId"
    `;
    const [{ eventId, startsAt }] = await client<
      {
        eventId: string;
        startsAt: string;
      }[]
    >`
      INSERT INTO events (
        organization_id,
        organizer_user_id,
        venue_id,
        name,
        lifecycle,
        starts_at
      )
      VALUES (
        ${organizationId},
        ${userId},
        ${venueId},
        'Breaking Summer Jam',
        'draft',
        '2026-06-10T09:30:00-06:00'
      )
      RETURNING id AS "eventId", starts_at AS "startsAt"
    `;
    const [{ lifecycle }] = await client<{ lifecycle: string }[]>`
      UPDATE events
      SET lifecycle = 'published'
      WHERE id = ${eventId}
      RETURNING lifecycle
    `;
    const [{ startsAtType }] = await client<{ startsAtType: string }[]>`
      SELECT pg_typeof(starts_at)::text AS "startsAtType"
      FROM events
      WHERE id = ${eventId}
    `;

    expect(new Date(startsAt).toISOString()).toBe('2026-06-10T15:30:00.000Z');
    expect(startsAtType).toBe('timestamp with time zone');
    expect(lifecycle).toBe('published');
  });

  it('resets event data and rejects missing schedules or cross-organization venues', async () => {
    const [{ eventCount }] = await client<{ eventCount: string }[]>`
      SELECT count(*) AS "eventCount" FROM events
    `;
    expect(eventCount).toBe('0');

    const [{ userId }] = await client<{ userId: string }[]>`
      INSERT INTO users (email, display_name)
      VALUES ('scope-organizer@example.com', 'Scope Organizer')
      RETURNING id AS "userId"
    `;
    const [{ firstOrganizationId }] = await client<{ firstOrganizationId: string }[]>`
      INSERT INTO organizations (name)
      VALUES ('First Collective')
      RETURNING id AS "firstOrganizationId"
    `;
    const [{ secondOrganizationId }] = await client<{ secondOrganizationId: string }[]>`
      INSERT INTO organizations (name)
      VALUES ('Second Collective')
      RETURNING id AS "secondOrganizationId"
    `;
    const [{ venueId }] = await client<{ venueId: string }[]>`
      INSERT INTO venues (organization_id, name)
      VALUES (${firstOrganizationId}, 'First Venue')
      RETURNING id AS "venueId"
    `;

    await expect(
      client`
        INSERT INTO events (
          organization_id,
          organizer_user_id,
          venue_id,
          name,
          lifecycle,
          starts_at
        )
        VALUES (
          ${firstOrganizationId},
          ${userId},
          ${venueId},
          'Missing Schedule',
          'draft',
          NULL
        )
      `,
    ).rejects.toMatchObject({ code: '23502' });

    await expect(
      client`
        INSERT INTO events (
          organization_id,
          organizer_user_id,
          venue_id,
          name,
          lifecycle,
          starts_at
        )
        VALUES (
          ${secondOrganizationId},
          ${userId},
          ${venueId},
          'Cross Scope',
          'draft',
          '2026-06-10T09:30:00-06:00'
        )
      `,
    ).rejects.toMatchObject({ code: '23503' });
  });
});
