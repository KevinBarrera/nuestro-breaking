import { type Sql } from 'postgres';
import { PostgresHarness } from './support/postgres-harness';

jest.setTimeout(120_000);

describe('participant registration persistence (e2e)', () => {
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

  it('stores independent participant identities, optional lookup fields, and timestamps', async () => {
    const rows = await client<
      {
        id: string;
        fullName: string;
        email: string | null;
        stageName: string | null;
        createdAt: Date;
        updatedAt: Date;
      }[]
    >`
      INSERT INTO participants (full_name, email, stage_name)
      VALUES ('First Dancer', 'shared@example.com', 'First'),
        ('Second Dancer', 'shared@example.com', NULL),
        ('Third Dancer', NULL, NULL)
      RETURNING id, full_name AS "fullName", email, stage_name AS "stageName",
        created_at AS "createdAt", updated_at AS "updatedAt"
    `;
    expect(rows).toHaveLength(3);
    expect(rows.map(({ id }) => id)).toEqual([
      expect.stringMatching(/^[0-9a-f-]{36}$/),
      expect.stringMatching(/^[0-9a-f-]{36}$/),
      expect.stringMatching(/^[0-9a-f-]{36}$/),
    ]);
    expect(rows.map(({ fullName, email, stageName }) => ({ fullName, email, stageName }))).toEqual([
      { fullName: 'First Dancer', email: 'shared@example.com', stageName: 'First' },
      { fullName: 'Second Dancer', email: 'shared@example.com', stageName: null },
      { fullName: 'Third Dancer', email: null, stageName: null },
    ]);
    expect(rows.every(({ createdAt, updatedAt }) => createdAt && updatedAt)).toBe(true);
    await expect(client`INSERT INTO participants (full_name) VALUES ('  ')`).rejects.toMatchObject({
      code: '23514',
      constraint_name: 'participants_full_name_ck',
    });
    await expect(client`INSERT INTO participants (full_name) VALUES (NULL)`).rejects.toMatchObject({
      code: '23502',
    });
  });

  it('registers a person once per event, with nullable event-scoped folios', async () => {
    const [{ organizationId }] = await client<{ organizationId: string }[]>`
      INSERT INTO organizations (name) VALUES ('Registration org') RETURNING id AS "organizationId"
    `;
    const events = await client<{ id: string }[]>`
      INSERT INTO events (organization_id, name, time_zone)
      VALUES (${organizationId}, 'First event', 'America/Bogota'),
        (${organizationId}, 'Second event', 'America/Bogota') RETURNING id
    `;
    const participants = await client<{ id: string }[]>`
      INSERT INTO participants (full_name) VALUES ('One'), ('Two'), ('Three') RETURNING id
    `;
    const [{ id, folio, createdAt, updatedAt }] = await client<
      { id: string; folio: string | null; createdAt: Date; updatedAt: Date }[]
    >`
      INSERT INTO event_registrations (event_id, participant_id, folio)
      VALUES (${events[0].id}, ${participants[0].id}, 'A-1')
      RETURNING id, folio, created_at AS "createdAt", updated_at AS "updatedAt"
    `;
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect({ folio, createdAt: !!createdAt, updatedAt: !!updatedAt }).toEqual({
      folio: 'A-1',
      createdAt: true,
      updatedAt: true,
    });
    await expect(
      client`
        INSERT INTO event_registrations (event_id, participant_id)
        VALUES (${events[0].id}, ${participants[0].id})
      `,
    ).rejects.toMatchObject({
      code: '23505',
      constraint_name: 'event_registrations_event_participant_uq',
    });
    await expect(
      client`
        INSERT INTO event_registrations (event_id, participant_id, folio)
        VALUES (${events[0].id}, ${participants[1].id}, 'A-1')
      `,
    ).rejects.toMatchObject({
      code: '23505',
      constraint_name: 'event_registrations_event_folio_uq',
    });
    await client`
      INSERT INTO event_registrations (event_id, participant_id, folio)
      VALUES (${events[1].id}, ${participants[0].id}, 'A-1'),
        (${events[0].id}, ${participants[1].id}, NULL),
        (${events[0].id}, ${participants[2].id}, NULL)
    `;
    const [{ count }] = await client<{ count: string }[]>`
      SELECT count(*) AS count FROM event_registrations
    `;
    expect(count).toBe('4');
  });

  it('links activities only to registrations for the same event and prevents duplicates', async () => {
    const [{ organizationId }] = await client<{ organizationId: string }[]>`
      INSERT INTO organizations (name) VALUES ('Activity org') RETURNING id AS "organizationId"
    `;
    const [{ venueId }] = await client<{ venueId: string }[]>`
      INSERT INTO venues (organization_id, name) VALUES (${organizationId}, 'Hall')
      RETURNING id AS "venueId"
    `;
    const events = await client<{ id: string }[]>`
      INSERT INTO events (organization_id, name, time_zone)
      VALUES (${organizationId}, 'First', 'America/Bogota'),
        (${organizationId}, 'Second', 'America/Bogota') RETURNING id
    `;
    await client`
      INSERT INTO event_venues (organization_id, event_id, venue_id)
      VALUES (${organizationId}, ${events[0].id}, ${venueId}),
        (${organizationId}, ${events[1].id}, ${venueId})
    `;
    const activities = await client<{ id: string }[]>`
      INSERT INTO activities (event_id, venue_id, kind, name, starts_at, ends_at)
      VALUES (${events[0].id}, ${venueId}, 'battle', 'First battle',
        TIMESTAMPTZ '2026-11-02 10:00+00', TIMESTAMPTZ '2026-11-02 11:00+00'),
        (${events[1].id}, ${venueId}, 'battle', 'Second battle',
        TIMESTAMPTZ '2026-11-02 10:00+00', TIMESTAMPTZ '2026-11-02 11:00+00') RETURNING id
    `;
    const [{ participantId }] = await client<{ participantId: string }[]>`
      INSERT INTO participants (full_name) VALUES ('Competitor') RETURNING id AS "participantId"
    `;
    const [{ registrationId }] = await client<{ registrationId: string }[]>`
      INSERT INTO event_registrations (event_id, participant_id)
      VALUES (${events[0].id}, ${participantId}) RETURNING id AS "registrationId"
    `;
    const [{ id, createdAt, updatedAt }] = await client<
      { id: string; createdAt: Date; updatedAt: Date }[]
    >`
      INSERT INTO event_activity_registrations (event_id, event_registration_id, activity_id)
      VALUES (${events[0].id}, ${registrationId}, ${activities[0].id})
      RETURNING id, created_at AS "createdAt", updated_at AS "updatedAt"
    `;
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect(createdAt).toBeTruthy();
    expect(updatedAt).toBeTruthy();
    await expect(
      client`
        INSERT INTO event_activity_registrations (event_id, event_registration_id, activity_id)
        VALUES (${events[0].id}, ${registrationId}, ${activities[0].id})
      `,
    ).rejects.toMatchObject({
      code: '23505',
      constraint_name: 'event_activity_registrations_registration_activity_uq',
    });
    await expect(
      client`
        INSERT INTO event_activity_registrations (event_id, event_registration_id, activity_id)
        VALUES (${events[0].id}, ${registrationId}, ${activities[1].id})
      `,
    ).rejects.toMatchObject({
      code: '23503',
      constraint_name: 'event_activity_registrations_activity_scope_fk',
    });
    await expect(
      client`
        INSERT INTO event_activity_registrations (event_id, event_registration_id, activity_id)
        VALUES (${events[1].id}, ${registrationId}, ${activities[1].id})
      `,
    ).rejects.toMatchObject({
      code: '23503',
      constraint_name: 'event_activity_registrations_registration_scope_fk',
    });
    await expect(client`
      UPDATE event_activity_registrations SET event_id = ${events[1].id} WHERE id = ${id}
    `).rejects.toMatchObject({ code: '23503' });
  });
});
