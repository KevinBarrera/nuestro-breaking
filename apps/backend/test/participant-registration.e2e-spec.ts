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

  it('stores the optional #58 profile and rejects blank, oversized or half-split values', async () => {
    const [legacy] = await client<{ firstName: string | null; birthDate: string | null }[]>`
      INSERT INTO participants (full_name, phone) VALUES ('Admin Name', '5512345678')
      RETURNING first_name AS "firstName", birth_date::text AS "birthDate"`;
    expect(legacy).toEqual({ firstName: null, birthDate: null });
    const [profile] = await client`
      INSERT INTO participants (full_name, email, phone, stage_name, first_name, first_last_name,
        second_last_name, city, instagram, level, birth_date)
      VALUES ('Ana López García', 'ana@example.com', '5512345678', 'Ani', 'Ana', 'López', 'García',
        'Puebla', 'ani.breaks', 'Intermedio', '2001-05-09')
      RETURNING first_name, first_last_name, second_last_name, city, instagram, level,
        birth_date::text AS birth_date`;
    expect(profile).toEqual({
      first_name: 'Ana',
      first_last_name: 'López',
      second_last_name: 'García',
      city: 'Puebla',
      instagram: 'ani.breaks',
      level: 'Intermedio',
      birth_date: '2001-05-09',
    });
    const invalid: [string, string, string][] = [
      ['first_name', 'participants_first_name_ck', ' '],
      ['second_last_name', 'participants_second_last_name_ck', ''],
      ['city', 'participants_city_ck', 'x'.repeat(101)],
      ['instagram', 'participants_instagram_ck', '  '],
      ['level', 'participants_level_ck', 'x'.repeat(51)],
      ['birth_date', 'participants_birth_date_ck', '1899-12-31'],
    ];
    for (const [column, constraint, value] of invalid) {
      const pair = column === 'first_name' ? ', first_last_name' : '';
      const pairValue = column === 'first_name' ? ", 'López'" : '';
      await expect(
        client.unsafe(
          `INSERT INTO participants (full_name, ${column}${pair}) VALUES ('Name', $1${pairValue})`,
          [value],
        ),
      ).rejects.toMatchObject({ code: '23514', constraint_name: constraint });
    }
    await expect(
      client`INSERT INTO participants (full_name, first_name) VALUES ('Ana', 'Ana')`,
    ).rejects.toMatchObject({ code: '23514', constraint_name: 'participants_name_parts_ck' });
    await expect(
      client`INSERT INTO participants (full_name, first_last_name) VALUES ('López', 'López')`,
    ).rejects.toMatchObject({ code: '23514', constraint_name: 'participants_name_parts_ck' });
  });

  it('registers a person once per event, with folios only on confirmed registrations, unique system-wide', async () => {
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
    const confirmed = (eventId: string, participantId: string, folio: string | null) => client<
      { id: string; folio: string | null; createdAt: Date; updatedAt: Date }[]
    >`
      INSERT INTO event_registrations
        (event_id, participant_id, folio, status, confirmation_source, confirmed_at)
      VALUES (${eventId}, ${participantId}, ${folio}, 'confirmed', 'admin_cash', now())
      RETURNING id, folio, created_at AS "createdAt", updated_at AS "updatedAt"
    `;
    const [{ id, folio, createdAt, updatedAt }] = await confirmed(
      events[0].id,
      participants[0].id,
      'EV-A2B3',
    );
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
    expect({ folio, createdAt: !!createdAt, updatedAt: !!updatedAt }).toEqual({
      folio: 'EV-A2B3',
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
    // The same folio is rejected in another event too.
    await expect(confirmed(events[1].id, participants[1].id, 'EV-A2B3')).rejects.toMatchObject({
      code: '23505',
      constraint_name: 'event_registrations_folio_uq',
    });
    await expect(
      client`
        INSERT INTO event_registrations (event_id, participant_id, folio)
        VALUES (${events[0].id}, ${participants[1].id}, 'EV-C4D5')
      `,
    ).rejects.toMatchObject({
      code: '23514',
      constraint_name: 'event_registrations_folio_status_ck',
    });
    await client`
      INSERT INTO event_registrations (event_id, participant_id, folio)
      VALUES (${events[1].id}, ${participants[0].id}, NULL),
        (${events[0].id}, ${participants[1].id}, NULL),
        (${events[0].id}, ${participants[2].id}, NULL)
    `;
    const [{ count }] = await client<{ count: string }[]>`
      SELECT count(*) AS count FROM event_registrations
    `;
    expect(count).toBe('4');
  });

  it('defaults registrations to pending and guards lifecycle confirmation metadata', async () => {
    const [{ organizationId }] = await client<{ organizationId: string }[]>`
      INSERT INTO organizations (name) VALUES ('Lifecycle org') RETURNING id AS "organizationId"
    `;
    const [{ eventId }] = await client<{ eventId: string }[]>`
      INSERT INTO events (organization_id, name, time_zone)
      VALUES (${organizationId}, 'Lifecycle event', 'America/Bogota') RETURNING id AS "eventId"
    `;
    const participants = await client<{ id: string }[]>`
      INSERT INTO participants (full_name)
      VALUES ('Pending'), ('Payment'), ('Cash'), ('Voided'), ('Invalid') RETURNING id
    `;
    const [{ id, status, confirmationSource, confirmedAt }] = await client<
      { id: string; status: string; confirmationSource: string | null; confirmedAt: Date | null }[]
    >`
      INSERT INTO event_registrations (event_id, participant_id)
      VALUES (${eventId}, ${participants[0].id})
      RETURNING id, status, confirmation_source AS "confirmationSource", confirmed_at AS "confirmedAt"
    `;
    expect({ status, confirmationSource, confirmedAt }).toEqual({
      status: 'pending_payment',
      confirmationSource: null,
      confirmedAt: null,
    });

    for (const [participant, source] of [
      [participants[1], 'approved_payment'],
      [participants[2], 'admin_cash'],
    ] as const) {
      const [confirmed] = await client<
        { status: string; confirmationSource: string; confirmedAt: string }[]
      >`
        INSERT INTO event_registrations
          (event_id, participant_id, status, confirmation_source, confirmed_at)
        VALUES (${eventId}, ${participant.id}, 'confirmed', ${source}, now())
        RETURNING status, confirmation_source AS "confirmationSource", confirmed_at AS "confirmedAt"
      `;
      expect(confirmed.status).toBe('confirmed');
      expect(confirmed.confirmationSource).toBe(source);
      expect(confirmed.confirmedAt).toMatch(/^\d{4}-\d{2}-\d{2}/);
    }
    const [{ status: voidedStatus }] = await client<{ status: string }[]>`
      INSERT INTO event_registrations (event_id, participant_id, status)
      VALUES (${eventId}, ${participants[3].id}, 'voided') RETURNING status
    `;
    expect(voidedStatus).toBe('voided');

    for (const [status, source, time] of [
      ['unknown', null, null],
      ['pending_payment', 'approved_payment', null],
      ['pending_payment', null, '2026-11-02 10:00+00'],
      ['confirmed', null, '2026-11-02 10:00+00'],
      ['confirmed', 'admin_cash', null],
      ['confirmed', 'untrusted', '2026-11-02 10:00+00'],
      ['voided', 'admin_cash', '2026-11-02 10:00+00'],
      ['voided', null, '2026-11-02 10:00+00'],
    ] as const) {
      await expect(client`
        INSERT INTO event_registrations
          (event_id, participant_id, status, confirmation_source, confirmed_at)
        VALUES (${eventId}, ${participants[4].id}, ${status}, ${source}, ${time})
      `).rejects.toMatchObject({ code: '23514' });
    }
    await expect(client`
      UPDATE event_registrations SET status = 'confirmed' WHERE id = ${id}
    `).rejects.toMatchObject({
      code: '23514',
      constraint_name: 'event_registrations_confirmation_metadata_ck',
    });
    await client`
      UPDATE event_registrations
      SET status = 'confirmed', confirmation_source = 'admin_cash', confirmed_at = now()
      WHERE id = ${id}
    `;
    await expect(client`
      UPDATE event_registrations SET status = 'voided' WHERE id = ${id}
    `).rejects.toMatchObject({
      code: '23514',
      constraint_name: 'event_registrations_confirmation_metadata_ck',
    });
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
