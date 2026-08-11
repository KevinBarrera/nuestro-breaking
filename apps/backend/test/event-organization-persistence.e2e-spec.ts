import { type Sql } from 'postgres';
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

  it('stores multiple scheduled events for one organization at a named venue', async () => {
    const [{ organizerUserId }] = await client<{ organizerUserId: string }[]>`
      INSERT INTO users (email, display_name)
      VALUES ('organizer@example.com', 'Organizer')
      RETURNING id AS "organizerUserId"
    `;
    const [{ organizationId }] = await client<{ organizationId: string }[]>`
      INSERT INTO organizations (name)
      VALUES ('Breaking Collective')
      RETURNING id AS "organizationId"
    `;
    const [{ venueId, venueName }] = await client<{ venueId: string; venueName: string }[]>`
      INSERT INTO venues (organization_id, name)
      VALUES (${organizationId}, 'Centro Cultural')
      RETURNING id AS "venueId", name AS "venueName"
    `;
    const [firstEvent] = await client<
      { eventId: string; startsAt: string; endsAt: string | null }[]
    >`
      INSERT INTO events (organization_id, organizer_user_id, venue_id, name, starts_at)
      VALUES (
        ${organizationId},
        ${organizerUserId},
        ${venueId},
        'Breaking Summer Jam',
        '2026-06-10T09:30:00-06:00'
      )
      RETURNING id AS "eventId", starts_at AS "startsAt", ends_at AS "endsAt"
    `;
    const [secondEvent] = await client<{ eventId: string }[]>`
      INSERT INTO events (organization_id, organizer_user_id, venue_id, name, starts_at)
      VALUES (
        ${organizationId},
        ${organizerUserId},
        ${venueId},
        'Breaking Winter Jam',
        '2026-12-10T09:30:00-06:00'
      )
      RETURNING id AS "eventId"
    `;
    const [{ eventCount, startsAtType }] = await client<
      { eventCount: string; startsAtType: string }[]
    >`
      SELECT
        count(*) AS "eventCount",
        max(pg_typeof(starts_at)::text) AS "startsAtType"
      FROM events
      WHERE organization_id = ${organizationId}
    `;

    expect(venueName).toBe('Centro Cultural');
    expect(firstEvent.eventId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(secondEvent.eventId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(secondEvent.eventId).not.toBe(firstEvent.eventId);
    expect(new Date(firstEvent.startsAt).toISOString()).toBe('2026-06-10T15:30:00.000Z');
    expect(firstEvent.endsAt).toBeNull();
    expect(eventCount).toBe('2');
    expect(startsAtType).toBe('timestamp with time zone');
  });

  it('resets persisted events and rejects invalid schedules or venue scope', async () => {
    const [{ eventCount }] = await client<{ eventCount: string }[]>`
      SELECT count(*) AS "eventCount" FROM events
    `;
    const [{ organizerUserId }] = await client<{ organizerUserId: string }[]>`
      INSERT INTO users (email, display_name)
      VALUES ('scope-organizer@example.com', 'Scope Organizer')
      RETURNING id AS "organizerUserId"
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

    expect(eventCount).toBe('0');

    await expect(
      client`
        INSERT INTO events (organization_id, organizer_user_id, venue_id, name, starts_at)
        VALUES (
          ${firstOrganizationId},
          ${organizerUserId},
          ${venueId},
          'Missing Schedule',
          NULL
        )
      `,
    ).rejects.toMatchObject({ code: '23502' });
    await expect(
      client`
        INSERT INTO events (organization_id, organizer_user_id, venue_id, name, starts_at)
        VALUES (
          ${secondOrganizationId},
          ${organizerUserId},
          ${venueId},
          'Cross Scope',
          '2026-06-10T09:30:00-06:00'
        )
      `,
    ).rejects.toMatchObject({ code: '23503' });
    await expect(
      client`
        INSERT INTO events (organization_id, organizer_user_id, venue_id, name, starts_at)
        VALUES (
          ${firstOrganizationId},
          '00000000-0000-0000-0000-000000000000',
          ${venueId},
          'Unknown Organizer',
          '2026-06-10T09:30:00-06:00'
        )
      `,
    ).rejects.toMatchObject({ code: '23503' });
  });
});
