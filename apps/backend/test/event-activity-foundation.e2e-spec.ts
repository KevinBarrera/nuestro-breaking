import { type Sql } from 'postgres';
import { PostgresHarness } from './support/postgres-harness';

jest.setTimeout(120_000);

describe('event activity foundation containers (e2e)', () => {
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

  it('resets and replays the container migration with no user ownership', async () => {
    await harness.reset();

    const [{ organizationsTable, venuesTable, eventsTable }] = await client<
      {
        organizationsTable: string | null;
        venuesTable: string | null;
        eventsTable: string | null;
      }[]
    >`
      SELECT
        to_regclass('public.organizations') AS "organizationsTable",
        to_regclass('public.venues') AS "venuesTable",
        to_regclass('public.events') AS "eventsTable"
    `;
    expect({ organizationsTable, venuesTable, eventsTable }).toEqual({
      organizationsTable: 'organizations',
      venuesTable: 'venues',
      eventsTable: 'events',
    });

    const [{ userOwnershipForeignKeys }] = await client<{ userOwnershipForeignKeys: string }[]>`
      SELECT count(*) AS "userOwnershipForeignKeys"
      FROM pg_constraint
      WHERE contype = 'f'
        AND conrelid IN ('organizations'::regclass, 'venues'::regclass, 'events'::regclass)
        AND confrelid = 'users'::regclass
    `;
    expect(userOwnershipForeignKeys).toBe('0');
  });

  it('creates an unbounded event without user ownership', async () => {
    const [{ organizationId }] = await client<{ organizationId: string }[]>`
      INSERT INTO organizations (name)
      VALUES ('Breaking Organization')
      RETURNING id AS "organizationId"
    `;
    const [{ venueId }] = await client<{ venueId: string }[]>`
      INSERT INTO venues (organization_id, name)
      VALUES (${organizationId}, 'Main Hall')
      RETURNING id AS "venueId"
    `;
    const [{ eventId, startsAt, endsAt, timeZone }] = await client<
      { eventId: string; startsAt: Date | null; endsAt: Date | null; timeZone: string }[]
    >`
      INSERT INTO events (organization_id, name, time_zone)
      VALUES (${organizationId}, 'Open Cypher', 'America/Bogota')
      RETURNING
        id AS "eventId",
        starts_at AS "startsAt",
        ends_at AS "endsAt",
        time_zone AS "timeZone"
    `;

    expect(venueId).toMatch(/^[0-9a-f-]{36}$/);
    expect(eventId).toMatch(/^[0-9a-f-]{36}$/);
    expect({ startsAt, endsAt, timeZone }).toEqual({
      startsAt: null,
      endsAt: null,
      timeZone: 'America/Bogota',
    });
  });

  it('accepts exact PG16 catalog zone names without a hardcoded alias rewrite', async () => {
    const [{ organizationId }] = await client<{ organizationId: string }[]>`
      INSERT INTO organizations (name)
      VALUES ('Time Zone Organization')
      RETURNING id AS "organizationId"
    `;

    const [{ catalogNames }] = await client<{ catalogNames: string[] }[]>`
      SELECT array_agg(name ORDER BY name) AS "catalogNames"
      FROM pg_catalog.pg_timezone_names
      WHERE name IN ('America/Bogota', 'US/Eastern', 'Etc/UTC')
    `;
    expect(catalogNames).toEqual(['America/Bogota', 'Etc/UTC']);

    const [{ triggerDefinition }] = await client<{ triggerDefinition: string }[]>`
      SELECT pg_get_functiondef('assert_event_time_zone'::regproc) AS "triggerDefinition"
    `;
    expect(triggerDefinition).toContain('pg_catalog.pg_timezone_names');
    expect(triggerDefinition).not.toContain('US/Eastern');

    await client`
      INSERT INTO events (organization_id, name, time_zone)
      VALUES (${organizationId}, 'Canonical zone', 'America/Bogota')
    `;
    await client`
      INSERT INTO events (organization_id, name, time_zone)
      VALUES (${organizationId}, 'Link zone', 'Etc/UTC')
    `;

    const rows = await client<{ timeZone: string }[]>`
      SELECT time_zone AS "timeZone"
      FROM events
      ORDER BY name
    `;
    expect(rows).toEqual([{ timeZone: 'America/Bogota' }, { timeZone: 'Etc/UTC' }]);

    await expect(
      client`
        INSERT INTO events (organization_id, name, time_zone)
        VALUES (${organizationId}, 'Invalid zone', 'Mars/Olympus_Mons')
      `,
    ).rejects.toMatchObject({ code: '23514', constraint_name: 'events_time_zone_ck' });
  });

  it('accepts a complete ordered event window', async () => {
    const [{ organizationId }] = await client<{ organizationId: string }[]>`
      INSERT INTO organizations (name)
      VALUES ('Bounded Window Organization')
      RETURNING id AS "organizationId"
    `;

    const [{ startsAt, endsAt }] = await client<{ startsAt: string; endsAt: string }[]>`
      INSERT INTO events (organization_id, name, time_zone, starts_at, ends_at)
      VALUES (
        ${organizationId},
        'Bounded event',
        'America/Bogota',
        TIMESTAMPTZ '2026-11-01 09:00:00+00',
        TIMESTAMPTZ '2026-11-03 18:00:00+00'
      )
      RETURNING starts_at AS "startsAt", ends_at AS "endsAt"
    `;

    expect({ startsAt, endsAt }).toEqual({
      startsAt: '2026-11-01 09:00:00+00',
      endsAt: '2026-11-03 18:00:00+00',
    });
  });

  it.each([
    ['only a start', "TIMESTAMPTZ '2026-11-01 09:00:00+00'", 'NULL'],
    ['only an end', 'NULL', "TIMESTAMPTZ '2026-11-03 18:00:00+00'"],
    [
      'an unordered pair',
      "TIMESTAMPTZ '2026-11-03 18:00:00+00'",
      "TIMESTAMPTZ '2026-11-01 09:00:00+00'",
    ],
    [
      'equal boundaries',
      "TIMESTAMPTZ '2026-11-01 09:00:00+00'",
      "TIMESTAMPTZ '2026-11-01 09:00:00+00'",
    ],
  ])('rejects %s event window', async (_description, startsAt, endsAt) => {
    const [{ organizationId }] = await client<{ organizationId: string }[]>`
      INSERT INTO organizations (name)
      VALUES ('Window Organization')
      RETURNING id AS "organizationId"
    `;

    try {
      await client.unsafe(
        `INSERT INTO events (organization_id, name, time_zone, starts_at, ends_at)
         VALUES ('${organizationId}', 'Invalid window', 'America/Bogota', ${startsAt}, ${endsAt})`,
      );
      throw new Error('Expected events_window_ck to reject the event window.');
    } catch (error) {
      expect(error).toMatchObject({ code: '23514', constraint_name: 'events_window_ck' });
    }
  });

  it('replays declarative membership and activity migrations after reset', async () => {
    await harness.reset();

    const [{ migrations, eventVenuesTable, activitiesTable }] = await client<
      { migrations: string[]; eventVenuesTable: string | null; activitiesTable: string | null }[]
    >`
      SELECT
        array_agg(hash ORDER BY created_at) AS migrations,
        to_regclass('public.event_venues') AS "eventVenuesTable",
        to_regclass('public.activities') AS "activitiesTable"
      FROM drizzle.__drizzle_migrations
    `;

    expect(migrations).toHaveLength(4);
    expect({ eventVenuesTable, activitiesTable }).toEqual({
      eventVenuesTable: 'event_venues',
      activitiesTable: 'activities',
    });
  });

  it('reuses a venue across events and rejects cross-organization membership', async () => {
    const [{ organizationId }] = await client<{ organizationId: string }[]>`
      INSERT INTO organizations (name) VALUES ('Reuse Organization') RETURNING id AS "organizationId"
    `;
    const [{ otherOrganizationId }] = await client<{ otherOrganizationId: string }[]>`
      INSERT INTO organizations (name) VALUES ('Other Organization') RETURNING id AS "otherOrganizationId"
    `;
    const [{ venueId }] = await client<{ venueId: string }[]>`
      INSERT INTO venues (organization_id, name)
      VALUES (${organizationId}, 'Reusable Hall')
      RETURNING id AS "venueId"
    `;
    const events = await client<{ eventId: string }[]>`
      INSERT INTO events (organization_id, name, time_zone)
      VALUES
        (${organizationId}, 'First event', 'America/Bogota'),
        (${organizationId}, 'Second event', 'America/Bogota')
      RETURNING id AS "eventId"
    `;
    const [{ otherVenueId }] = await client<{ otherVenueId: string }[]>`
      INSERT INTO venues (organization_id, name)
      VALUES (${otherOrganizationId}, 'Other Hall')
      RETURNING id AS "otherVenueId"
    `;

    await client`
      INSERT INTO event_venues (organization_id, event_id, venue_id)
      VALUES
        (${organizationId}, ${events[0].eventId}, ${venueId}),
        (${organizationId}, ${events[1].eventId}, ${venueId})
    `;
    await expect(
      client`
        INSERT INTO event_venues (organization_id, event_id, venue_id)
        VALUES (${organizationId}, ${events[0].eventId}, ${otherVenueId})
      `,
    ).rejects.toMatchObject({ code: '23503' });

    const [{ memberships }] = await client<{ memberships: string }[]>`
      SELECT count(*) AS memberships FROM event_venues
    `;
    expect(memberships).toBe('2');
  });

  it('rejects unattached venues, blank values, and unordered or equal activity intervals', async () => {
    const [{ organizationId }] = await client<{ organizationId: string }[]>`
      INSERT INTO organizations (name) VALUES ('Activity Validation Organization')
      RETURNING id AS "organizationId"
    `;
    const [{ eventId }] = await client<{ eventId: string }[]>`
      INSERT INTO events (organization_id, name, time_zone)
      VALUES (${organizationId}, 'Activity validation event', 'America/Bogota')
      RETURNING id AS "eventId"
    `;
    const [{ venueId }] = await client<{ venueId: string }[]>`
      INSERT INTO venues (organization_id, name)
      VALUES (${organizationId}, 'Unattached Hall')
      RETURNING id AS "venueId"
    `;

    await expect(
      client`
        INSERT INTO activities (event_id, venue_id, kind, name, starts_at, ends_at)
        VALUES (
          ${eventId}, ${venueId}, 'social', 'Unattached activity',
          TIMESTAMPTZ '2026-11-02 10:00:00+00', TIMESTAMPTZ '2026-11-02 11:00:00+00'
        )
      `,
    ).rejects.toMatchObject({ code: '23503' });

    await client`
      INSERT INTO event_venues (organization_id, event_id, venue_id)
      VALUES (${organizationId}, ${eventId}, ${venueId})
    `;
    await expect(
      client`
        INSERT INTO activities (event_id, venue_id, kind, name, starts_at, ends_at)
        VALUES (
          ${eventId}, ${venueId}, ' ', 'Valid name',
          TIMESTAMPTZ '2026-11-02 10:00:00+00', TIMESTAMPTZ '2026-11-02 11:00:00+00'
        )
      `,
    ).rejects.toMatchObject({ code: '23514', constraint_name: 'activities_kind_ck' });
    await expect(
      client`
        INSERT INTO activities (event_id, venue_id, kind, name, starts_at, ends_at)
        VALUES (
          ${eventId}, ${venueId}, 'social', ' ',
          TIMESTAMPTZ '2026-11-02 10:00:00+00', TIMESTAMPTZ '2026-11-02 11:00:00+00'
        )
      `,
    ).rejects.toMatchObject({ code: '23514', constraint_name: 'activities_name_ck' });
    await expect(
      client`
        INSERT INTO activities (event_id, venue_id, kind, name, starts_at, ends_at)
        VALUES (
          ${eventId}, ${venueId}, 'social', 'Late activity',
          TIMESTAMPTZ '2026-11-02 11:00:00+00', TIMESTAMPTZ '2026-11-02 10:00:00+00'
        )
      `,
    ).rejects.toMatchObject({ code: '23514', constraint_name: 'activities_window_ck' });
    await expect(
      client`
        INSERT INTO activities (event_id, venue_id, kind, name, starts_at, ends_at)
        VALUES (
          ${eventId}, ${venueId}, 'social', 'Equal interval activity',
          TIMESTAMPTZ '2026-11-02 10:00:00+00', TIMESTAMPTZ '2026-11-02 10:00:00+00'
        )
      `,
    ).rejects.toMatchObject({ code: '23514', constraint_name: 'activities_window_ck' });
  });

  it('normalizes equivalent offsets, retains the event zone, and permits overlaps', async () => {
    const [{ organizationId }] = await client<{ organizationId: string }[]>`
      INSERT INTO organizations (name) VALUES ('Offset Organization') RETURNING id AS "organizationId"
    `;
    const [{ eventId }] = await client<{ eventId: string }[]>`
      INSERT INTO events (organization_id, name, time_zone)
      VALUES (${organizationId}, 'Offset event', 'America/Bogota')
      RETURNING id AS "eventId"
    `;
    const [{ venueId }] = await client<{ venueId: string }[]>`
      INSERT INTO venues (organization_id, name)
      VALUES (${organizationId}, 'Offset Hall')
      RETURNING id AS "venueId"
    `;
    await client`
      INSERT INTO event_venues (organization_id, event_id, venue_id)
      VALUES (${organizationId}, ${eventId}, ${venueId})
    `;

    const activityRows = await client<{ activityId: string }[]>`
      INSERT INTO activities (event_id, venue_id, kind, name, starts_at, ends_at)
      VALUES
        (
          ${eventId}, ${venueId}, 'social', 'Offset activity',
          TIMESTAMPTZ '2026-11-02 10:00:00-05', TIMESTAMPTZ '2026-11-02 11:00:00-05'
        ),
        (
          ${eventId}, ${venueId}, 'social', 'Overlapping activity',
          TIMESTAMPTZ '2026-11-02 14:30:00+00', TIMESTAMPTZ '2026-11-02 16:30:00+00'
        )
      RETURNING id AS "activityId"
    `;
    expect(activityRows.map(({ activityId }) => activityId)).toEqual([
      expect.stringMatching(/^[0-9a-f-]{36}$/),
      expect.stringMatching(/^[0-9a-f-]{36}$/),
    ]);

    const [{ equivalentStart, timeZone, activitiesCount }] = await client<
      { equivalentStart: boolean; timeZone: string; activitiesCount: string }[]
    >`
      SELECT
        bool_and(activities.starts_at = TIMESTAMPTZ '2026-11-02 15:00:00+00')
          FILTER (WHERE activities.name = 'Offset activity') AS "equivalentStart",
        max(events.time_zone) AS "timeZone",
        count(*) AS "activitiesCount"
      FROM activities
      JOIN events ON events.id = activities.event_id
      GROUP BY activities.event_id
    `;
    expect({ equivalentStart, timeZone, activitiesCount }).toEqual({
      equivalentStart: true,
      timeZone: 'America/Bogota',
      activitiesCount: '2',
    });
  });

  it('contains activity inserts and updates within bounded events, including exact edges and overlaps', async () => {
    const [{ organizationId }] = await client<{ organizationId: string }[]>`
      INSERT INTO organizations (name) VALUES ('Containment Organization') RETURNING id AS "organizationId"
    `;
    const [{ eventId }] = await client<{ eventId: string }[]>`
      INSERT INTO events (organization_id, name, time_zone, starts_at, ends_at)
      VALUES (
        ${organizationId}, 'Bounded event', 'America/Bogota',
        TIMESTAMPTZ '2026-11-02 09:00+00', TIMESTAMPTZ '2026-11-02 18:00+00'
      ) RETURNING id AS "eventId"
    `;
    const [{ venueId }] = await client<{ venueId: string }[]>`
      INSERT INTO venues (organization_id, name) VALUES (${organizationId}, 'Hall')
      RETURNING id AS "venueId"
    `;
    await client`
      INSERT INTO event_venues (organization_id, event_id, venue_id)
      VALUES (${organizationId}, ${eventId}, ${venueId})
    `;

    const [{ activityId }] = await client<{ activityId: string }[]>`
      INSERT INTO activities (event_id, venue_id, kind, name, starts_at, ends_at)
      VALUES (
        ${eventId}, ${venueId}, 'social', 'Exact edges',
        TIMESTAMPTZ '2026-11-02 09:00+00', TIMESTAMPTZ '2026-11-02 18:00+00'
      ) RETURNING id AS "activityId"
    `;
    await client`
      INSERT INTO activities (event_id, venue_id, kind, name, starts_at, ends_at)
      VALUES (
        ${eventId}, ${venueId}, 'social', 'Overlapping',
        TIMESTAMPTZ '2026-11-02 10:00+00', TIMESTAMPTZ '2026-11-02 12:00+00'
      )
    `;
    await expect(
      client`
        INSERT INTO activities (event_id, venue_id, kind, name, starts_at, ends_at)
        VALUES (
          ${eventId}, ${venueId}, 'social', 'Before start',
          TIMESTAMPTZ '2026-11-02 08:59+00', TIMESTAMPTZ '2026-11-02 10:00+00'
        )
      `,
    ).rejects.toMatchObject({ code: '23514', constraint_name: 'activities_event_window_ck' });
    await expect(
      client`
        INSERT INTO activities (event_id, venue_id, kind, name, starts_at, ends_at)
        VALUES (
          ${eventId}, ${venueId}, 'social', 'After end',
          TIMESTAMPTZ '2026-11-02 17:00+00', TIMESTAMPTZ '2026-11-02 18:01+00'
        )
      `,
    ).rejects.toMatchObject({ code: '23514', constraint_name: 'activities_event_window_ck' });
    await expect(
      client`
        UPDATE activities SET starts_at = TIMESTAMPTZ '2026-11-02 08:59+00'
        WHERE id = ${activityId}
      `,
    ).rejects.toMatchObject({ code: '23514', constraint_name: 'activities_event_window_ck' });
    await expect(
      client`
        UPDATE activities SET ends_at = TIMESTAMPTZ '2026-11-02 18:01+00'
        WHERE id = ${activityId}
      `,
    ).rejects.toMatchObject({ code: '23514', constraint_name: 'activities_event_window_ck' });
    await client`
      UPDATE activities SET starts_at = TIMESTAMPTZ '2026-11-02 10:00+00',
        ends_at = TIMESTAMPTZ '2026-11-02 17:00+00'
      WHERE id = ${activityId}
    `;
    const [{ count }] = await client<{ count: string }[]>`
      SELECT count(*) AS count FROM activities WHERE event_id = ${eventId}
    `;
    expect(count).toBe('2');
  });

  it('allows unbounded activities and only bounds or narrows events around contained activities', async () => {
    const [{ organizationId }] = await client<{ organizationId: string }[]>`
      INSERT INTO organizations (name) VALUES ('Window Changes Organization') RETURNING id AS "organizationId"
    `;
    const [{ eventId }] = await client<{ eventId: string }[]>`
      INSERT INTO events (organization_id, name, time_zone)
      VALUES (${organizationId}, 'Initially unbounded', 'America/Bogota')
      RETURNING id AS "eventId"
    `;
    const [{ venueId }] = await client<{ venueId: string }[]>`
      INSERT INTO venues (organization_id, name) VALUES (${organizationId}, 'Hall')
      RETURNING id AS "venueId"
    `;
    await client`
      INSERT INTO event_venues (organization_id, event_id, venue_id)
      VALUES (${organizationId}, ${eventId}, ${venueId})
    `;
    await client`
      INSERT INTO activities (event_id, venue_id, kind, name, starts_at, ends_at)
      VALUES (
        ${eventId}, ${venueId}, 'social', 'Unbounded activity',
        TIMESTAMPTZ '2026-11-02 09:00+00', TIMESTAMPTZ '2026-11-02 18:00+00'
      )
    `;
    await expect(
      client`
        UPDATE events SET starts_at = TIMESTAMPTZ '2026-11-02 10:00+00',
          ends_at = TIMESTAMPTZ '2026-11-02 19:00+00'
        WHERE id = ${eventId}
      `,
    ).rejects.toMatchObject({ code: '23514', constraint_name: 'events_activities_window_ck' });
    await client`
      UPDATE events SET starts_at = TIMESTAMPTZ '2026-11-02 09:00+00',
        ends_at = TIMESTAMPTZ '2026-11-02 18:00+00'
      WHERE id = ${eventId}
    `;
    await expect(
      client`
        UPDATE events SET ends_at = TIMESTAMPTZ '2026-11-02 17:00+00'
        WHERE id = ${eventId}
      `,
    ).rejects.toMatchObject({ code: '23514', constraint_name: 'events_activities_window_ck' });
    await client`
      UPDATE events SET starts_at = TIMESTAMPTZ '2026-11-02 08:00+00',
        ends_at = TIMESTAMPTZ '2026-11-02 19:00+00'
      WHERE id = ${eventId}
    `;
    await client`
      UPDATE events SET starts_at = NULL, ends_at = NULL WHERE id = ${eventId}
    `;
    const [{ startsAt, endsAt }] = await client<
      { startsAt: string | null; endsAt: string | null }[]
    >`
      SELECT starts_at AS "startsAt", ends_at AS "endsAt" FROM events WHERE id = ${eventId}
    `;
    expect({ startsAt, endsAt }).toEqual({ startsAt: null, endsAt: null });
  });

  it('uses no action for delete and key updates, then permits activity-first cleanup', async () => {
    const [{ organizationId }] = await client<{ organizationId: string }[]>`
      INSERT INTO organizations (name) VALUES ('No Action Organization') RETURNING id AS "organizationId"
    `;
    const [{ eventId }] = await client<{ eventId: string }[]>`
      INSERT INTO events (organization_id, name, time_zone)
      VALUES (${organizationId}, 'No action event', 'America/Bogota')
      RETURNING id AS "eventId"
    `;
    const [{ venueId }] = await client<{ venueId: string }[]>`
      INSERT INTO venues (organization_id, name)
      VALUES (${organizationId}, 'No action hall')
      RETURNING id AS "venueId"
    `;
    await client`
      INSERT INTO event_venues (organization_id, event_id, venue_id)
      VALUES (${organizationId}, ${eventId}, ${venueId})
    `;
    const [{ activityId }] = await client<{ activityId: string }[]>`
      INSERT INTO activities (event_id, venue_id, kind, name, starts_at, ends_at)
      VALUES (
        ${eventId}, ${venueId}, 'social', 'No action activity',
        TIMESTAMPTZ '2026-11-02 10:00:00+00', TIMESTAMPTZ '2026-11-02 11:00:00+00'
      )
      RETURNING id AS "activityId"
    `;

    await expect(
      client`DELETE FROM event_venues WHERE event_id = ${eventId} AND venue_id = ${venueId}`,
    ).rejects.toMatchObject({
      code: '23503',
    });
    await expect(
      client`UPDATE events SET id = gen_random_uuid() WHERE id = ${eventId}`,
    ).rejects.toMatchObject({
      code: '23503',
    });

    await client`DELETE FROM activities WHERE id = ${activityId}`;
    await client`DELETE FROM event_venues WHERE event_id = ${eventId} AND venue_id = ${venueId}`;

    const [{ memberships, activitiesCount }] = await client<
      { memberships: string; activitiesCount: string }[]
    >`
      SELECT
        (SELECT count(*) FROM event_venues) AS memberships,
        (SELECT count(*) FROM activities) AS "activitiesCount"
    `;
    expect({ memberships, activitiesCount }).toEqual({ memberships: '0', activitiesCount: '0' });
  });
});
