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
});
