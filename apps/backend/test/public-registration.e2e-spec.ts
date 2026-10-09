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
import type { PublicRegistrationResult } from '@/events/public-registration';
import { PostgresHarness } from './support/postgres-harness';

jest.setTimeout(120_000);

const DAY = 24 * 60 * 60 * 1000;
const SLUG = 'los-mas-pesados-nov-2026';
const ROUTE = `/public/events/${SLUG}/registrations`;
const UNAVAILABLE = {
  statusCode: 409,
  code: 'registration_unavailable',
  message: 'This registration cannot be completed online. Please contact the organizer.',
};
type Ids = Record<
  'full' | 'general' | 'addOn' | 'archived' | 'foreignPass' | 'toprock' | 'retired' | 'openStyles',
  string
>;
// Personal data that must never reach an audit row or a neutral duplicate answer.
const PERSONAL = /Ana|López|ana@example\.com|5512345678|55 1234|Ciudad|b\.girl/;

describe('public registration (e2e)', () => {
  const harness = new PostgresHarness();
  let client: Sql;
  let app: INestApplication<App>;

  const compile = async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(DatabaseService)
      .useValue({ db: {} })
      .overrideProvider(DATABASE_CLIENT)
      .useValue(drizzle({ client, schema }))
      .compile();
    const created = moduleRef.createNestApplication<INestApplication<App>>();
    await created.init();
    return created;
  };

  beforeAll(async () => {
    // Keep the throttler out of the way; one test below checks it with its own app.
    process.env.PUBLIC_RATE_LIMIT_LIMIT = '10000';
    client = await harness.start();
    app = await compile();
  });
  beforeEach(async () => harness.reset());
  afterAll(async () => {
    delete process.env.PUBLIC_RATE_LIMIT_LIMIT;
    await app?.close();
    await harness.stop();
  });

  async function fixture() {
    const [{ id: org }] = await client<
      { id: string }[]
    >`INSERT INTO organizations (name) VALUES ('Org') RETURNING id`;
    const [event, other] = await client<{ id: string }[]>`
      INSERT INTO events (organization_id, name, time_zone, slug, starts_at, ends_at,
          sales_enabled, sales_opens_at)
      VALUES (${org}, 'Los más pesados', 'America/Mexico_City', ${SLUG},
          '2026-11-20T14:00:00Z', '2026-11-22T04:00:00Z', true, ${new Date(Date.now() - DAY).toISOString()}),
        (${org}, 'Other', 'Etc/UTC', 'other-event', NULL, NULL, true, NULL)
      RETURNING id`;
    const [{ id: venue }] = await client<{ id: string }[]>`
      INSERT INTO venues (organization_id, name) VALUES (${org}, 'Hall') RETURNING id`;
    await client`INSERT INTO event_venues (organization_id, event_id, venue_id)
      VALUES (${org}, ${event.id}, ${venue}), (${org}, ${other.id}, ${venue})`;
    const [toprock, footwork, retired, openStyles, foreign] = await client<{ id: string }[]>`
      INSERT INTO activities (event_id, venue_id, kind, name, starts_at, ends_at, status)
      VALUES (${event.id}, ${venue}, 'competition', 'Toprock', '2026-11-20T18:00:00Z', '2026-11-20T20:00:00Z', 'active'),
        (${event.id}, ${venue}, 'competition', 'Footwork', '2026-11-20T15:00:00Z', '2026-11-20T17:00:00Z', 'active'),
        (${event.id}, ${venue}, 'competition', 'Retired', '2026-11-20T14:00:00Z', '2026-11-20T15:00:00Z', 'active'),
        (${event.id}, ${venue}, 'competition', 'Open Styles 1vs1', '2026-11-21T18:00:00Z', '2026-11-21T20:00:00Z', 'active'),
        (${other.id}, ${venue}, 'competition', 'Foreign', '2026-11-20T10:00:00Z', '2026-11-20T12:00:00Z', 'active')
      RETURNING id`;
    const [full, general, addOn, archived, foreignPass] = await client<{ id: string }[]>`
      INSERT INTO event_pass_types (event_id, name, pass_class, price_cents, requires_pass_class, status)
      VALUES (${event.id}, 'Pase completo Breaking', 'full', 200000, NULL, 'active'),
        (${event.id}, 'Entrada general', 'general', 100000, NULL, 'active'),
        (${event.id}, 'Open Styles', 'add_on', 80000, 'full', 'active'),
        (${event.id}, 'Pase viejo', 'full', 150000, NULL, 'archived'),
        (${other.id}, 'Foreign pass', 'full', 1000, NULL, 'active')
      RETURNING id`;
    await client`INSERT INTO event_pass_type_activities (event_id, pass_type_id, activity_id, access)
      VALUES (${event.id}, ${full.id}, ${toprock.id}, 'selectable'),
        (${event.id}, ${full.id}, ${footwork.id}, 'selectable'),
        (${event.id}, ${full.id}, ${retired.id}, 'selectable'),
        (${event.id}, ${addOn.id}, ${openStyles.id}, 'included'),
        (${other.id}, ${foreignPass.id}, ${foreign.id}, 'selectable')`;
    await client`UPDATE activities SET status = 'archived', version = version + 1 WHERE id = ${retired.id}`;
    return {
      event: event.id,
      other: other.id,
      toprock: toprock.id,
      footwork: footwork.id,
      retired: retired.id,
      openStyles: openStyles.id,
      full: full.id,
      general: general.id,
      addOn: addOn.id,
      archived: archived.id,
      foreignPass: foreignPass.id,
    };
  }

  const buyer = (overrides: Record<string, unknown> = {}) => ({
    firstName: 'Ana',
    firstLastName: 'López',
    secondLastName: 'García',
    stageName: 'B-Girl Ana',
    email: ' Ana@Example.com ',
    phone: ' 55 1234 5678 ',
    city: 'Ciudad de México',
    instagram: '@B.Girl_Ana',
    level: 'Intermedio',
    birthDate: '2000-02-29',
    ...overrides,
  });
  const register = (body: unknown, slug = SLUG) =>
    request(app.getHttpServer())
      .post(`/public/events/${slug}/registrations`)
      .send(body as object);
  const counts = async () => {
    const [row] = await client<{ registrations: number; passes: number; audits: number }[]>`
      SELECT (SELECT count(*)::int FROM event_registrations) AS registrations,
        (SELECT count(*)::int FROM event_registration_passes) AS passes,
        (SELECT count(*)::int FROM registration_operation_audit) AS audits`;
    return row;
  };
  // An existing registration in the event, as admin manual registration would store it.
  const existing = async (
    eventId: string,
    status: 'pending_payment' | 'confirmed' | 'voided',
    contact: { email: string | null; phone: string | null },
  ) => {
    const [{ id: participant }] = await client<{ id: string }[]>`
      INSERT INTO participants (full_name, email, phone)
      VALUES ('Existing Person', ${contact.email}, ${contact.phone}) RETURNING id`;
    const confirmed = status === 'confirmed';
    const [{ id }] = await client<{ id: string }[]>`
      INSERT INTO event_registrations (event_id, participant_id, status, confirmation_source, confirmed_at)
      VALUES (${eventId}, ${participant}, ${status}, ${confirmed ? 'admin_cash' : null},
        ${confirmed ? new Date().toISOString() : null})
      RETURNING id`;
    return id;
  };

  it('creates one pending registration with snapshotted prices, selections and a public audit fact', async () => {
    const ids = await fixture();

    const response = await register({
      buyer: buyer(),
      passes: [
        { passTypeId: ids.full, selectedActivityIds: [ids.toprock, ids.footwork] },
        { passTypeId: ids.addOn },
      ],
    }).expect(201);

    const body = response.body as PublicRegistrationResult;
    expect(response.headers['set-cookie']).toBeUndefined();
    expect(body).toEqual({
      registrationId: expect.any(String) as string,
      status: 'pending_payment',
      passes: [
        {
          passTypeId: ids.full,
          name: 'Pase completo Breaking',
          passClass: 'full',
          priceCents: 200000,
          selectedActivityIds: [ids.toprock, ids.footwork],
        },
        {
          passTypeId: ids.addOn,
          name: 'Open Styles',
          passClass: 'add_on',
          priceCents: 80000,
          selectedActivityIds: [],
        },
      ],
      totalCents: 280000,
    });

    const [registration] = await client`
      SELECT r.status, r.folio, r.confirmation_source, p.full_name, p.first_name, p.first_last_name,
        p.second_last_name, p.stage_name, p.email, p.phone, p.city, p.instagram, p.level,
        p.birth_date::text AS birth_date
      FROM event_registrations r JOIN participants p ON p.id = r.participant_id
      WHERE r.id = ${body.registrationId} AND r.event_id = ${ids.event}`;
    expect(registration).toEqual({
      status: 'pending_payment',
      folio: null,
      confirmation_source: null,
      full_name: 'Ana López García',
      first_name: 'Ana',
      first_last_name: 'López',
      second_last_name: 'García',
      stage_name: 'B-Girl Ana',
      email: 'ana@example.com',
      phone: '55 1234 5678',
      city: 'Ciudad de México',
      instagram: 'b.girl_ana',
      level: 'Intermedio',
      birth_date: '2000-02-29',
    });

    // Raising the catalog price later never changes the snapshot.
    await client`UPDATE event_pass_types SET price_cents = 999999 WHERE id = ${ids.full}`;
    const held = await client`
      SELECT rp.pass_type_id, rp.price_cents,
        coalesce(array_agg(s.activity_id ORDER BY s.activity_id) FILTER (WHERE s.activity_id IS NOT NULL), '{}') AS selections
      FROM event_registration_passes rp
      LEFT JOIN event_registration_pass_selections s ON s.registration_pass_id = rp.id
      WHERE rp.event_registration_id = ${body.registrationId}
      GROUP BY rp.pass_type_id, rp.price_cents ORDER BY rp.price_cents DESC`;
    expect(held).toEqual([
      {
        pass_type_id: ids.full,
        price_cents: 200000,
        selections: [ids.toprock, ids.footwork].sort(),
      },
      { pass_type_id: ids.addOn, price_cents: 80000, selections: [] },
    ]);

    const audits = await client`
      SELECT operation_type, actor_kind, actor_user_id, session_id, registration_id,
        amount_cents, before_state, after_state, facts, affected_activity_ids
      FROM registration_operation_audit`;
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({
      operation_type: 'online_registration',
      actor_kind: 'public',
      actor_user_id: null,
      session_id: null,
      registration_id: body.registrationId,
      amount_cents: null,
      before_state: { registration: null },
      facts: { participantCreated: true, registrationReused: false },
    });
    expect(JSON.stringify(audits[0])).not.toMatch(PERSONAL);
    expect(await counts()).toEqual({ registrations: 1, passes: 2, audits: 1 });
  });

  it('answers 400 with field errors for missing required fields and a malformed email', async () => {
    await fixture();

    const missing = await register({ buyer: {}, passes: [] }).expect(400);
    expect(missing.body).toEqual({
      statusCode: 400,
      message: 'Invalid registration',
      fieldErrors: {
        'buyer.firstName': 'required',
        'buyer.firstLastName': 'required',
        'buyer.email': 'required',
        'buyer.phone': 'required',
        passes: 'required',
      },
    });
    const malformed = await register({
      buyer: buyer({ email: 'ana@example', unexpected: 1 }),
      passes: [{ passTypeId: 'nope' }],
    }).expect(400);
    expect((malformed.body as { fieldErrors: unknown }).fieldErrors).toEqual({
      'buyer.email': 'invalid',
      'buyer.unexpected': 'unknown_field',
      'passes[0].passTypeId': 'invalid',
    });
    expect(await counts()).toEqual({ registrations: 0, passes: 0, audits: 0 });
  });

  it.each([
    [
      'Open Styles without a full pass',
      (ids: Ids) => [{ passTypeId: ids.addOn }],
      'required_pass_missing',
      'Add-on requires a full pass',
    ],
    [
      'general entry with a full pass',
      (ids: Ids) => [{ passTypeId: ids.general }, { passTypeId: ids.full }],
      'general_with_full',
      'A full pass already includes general entry',
    ],
    [
      'an archived pass type',
      (ids: Ids) => [{ passTypeId: ids.archived }],
      'pass_type_unavailable',
      'Pass type is not available',
    ],
    [
      'a pass type of another event',
      (ids: Ids) => [{ passTypeId: ids.foreignPass }],
      'pass_type_unavailable',
      'Pass type is not available',
    ],
    [
      'an archived activity',
      (ids: Ids) => [{ passTypeId: ids.full, selectedActivityIds: [ids.toprock, ids.retired] }],
      'selection_unavailable',
      'Invalid activity selection',
    ],
    [
      'an included (not selectable) activity',
      (ids: Ids) => [
        { passTypeId: ids.full },
        { passTypeId: ids.addOn, selectedActivityIds: [ids.openStyles] },
      ],
      'selection_unavailable',
      'Invalid activity selection',
    ],
  ])('rejects %s with 409 and writes nothing', async (_case, passes, code, message) => {
    const ids = await fixture();

    const response = await register({ buyer: buyer(), passes: passes(ids) }).expect(409);

    expect(response.body).toEqual({ statusCode: 409, code, message });
    expect(await counts()).toEqual({ registrations: 0, passes: 0, audits: 0 });
    const [{ participants }] = await client<{ participants: number }[]>`
      SELECT count(*)::int AS participants FROM participants`;
    expect(participants).toBe(0);
  });

  it('answers 409 while sales are closed and 404 for an unknown slug', async () => {
    const ids = await fixture();
    await client`UPDATE events SET sales_enabled = false WHERE id = ${ids.event}`;

    const closed = await register({ buyer: buyer(), passes: [{ passTypeId: ids.full }] }).expect(
      409,
    );
    expect(closed.body).toEqual({
      statusCode: 409,
      message: 'Sales are closed',
      reason: 'disabled',
    });
    await register({ buyer: buyer(), passes: [{ passTypeId: ids.full }] }, 'missing-event').expect(
      404,
    );
    expect(await counts()).toEqual({ registrations: 0, passes: 0, audits: 0 });
  });

  it.each([
    ['email', { email: 'ANA@example.com ', phone: '33 9999 0000' }],
    ['phone with +52', { email: null, phone: '+52 55 1234 5678' }],
    ['phone with the legacy 521 prefix', { email: 'other@example.com', phone: '5215512345678' }],
  ])(
    'rejects a buyer with a confirmed registration matched by %s, neutrally',
    async (_case, contact) => {
      const ids = await fixture();
      await existing(ids.event, 'confirmed', contact);
      const before = await counts();

      const response = await register({
        buyer: buyer(),
        passes: [{ passTypeId: ids.full }],
      }).expect(409);

      expect(response.body).toEqual(UNAVAILABLE);
      expect(JSON.stringify(response.body)).not.toMatch(/Existing|folio|confirmed|LMP|EV-/);
      expect(await counts()).toEqual(before);
    },
  );

  it('matches a stored national phone when the buyer types +52', async () => {
    const ids = await fixture();
    await existing(ids.event, 'confirmed', { email: null, phone: '5512345678' });

    const response = await register({
      buyer: buyer({ phone: '+52 (55) 1234-5678' }),
      passes: [{ passTypeId: ids.full }],
    }).expect(409);

    expect(response.body).toEqual(UNAVAILABLE);
  });

  it('ignores registrations of other events', async () => {
    const ids = await fixture();
    await existing(ids.other, 'confirmed', { email: 'ana@example.com', phone: '5512345678' });

    await register({ buyer: buyer(), passes: [{ passTypeId: ids.full }] }).expect(201);
  });

  it('reuses the pending registration of the same buyer and replaces its passes', async () => {
    const ids = await fixture();
    const first = (
      await register({
        buyer: buyer(),
        passes: [
          { passTypeId: ids.full, selectedActivityIds: [ids.toprock] },
          { passTypeId: ids.addOn },
        ],
      }).expect(201)
    ).body as PublicRegistrationResult;

    const second = await register({
      buyer: buyer({ email: 'new@example.com', phone: '+52 55 1234 5678', city: null }),
      passes: [{ passTypeId: ids.general }],
    }).expect(201);

    expect(second.body).toEqual({
      registrationId: first.registrationId,
      status: 'pending_payment',
      passes: [
        {
          passTypeId: ids.general,
          name: 'Entrada general',
          passClass: 'general',
          priceCents: 100000,
          selectedActivityIds: [],
        },
      ],
      totalCents: 100000,
    });
    expect(await counts()).toEqual({ registrations: 1, passes: 1, audits: 2 });
    const [{ selections }] = await client<{ selections: number }[]>`
      SELECT count(*)::int AS selections FROM event_registration_pass_selections`;
    expect(selections).toBe(0);
    const [participant] = await client`
      SELECT p.email, p.phone, p.city FROM participants p
      JOIN event_registrations r ON r.participant_id = p.id WHERE r.id = ${first.registrationId}`;
    expect(participant).toEqual({
      email: 'new@example.com',
      phone: '+52 55 1234 5678',
      city: null,
    });
    const [audit] = await client`
      SELECT actor_kind, before_state, facts FROM registration_operation_audit
      ORDER BY created_at DESC, id LIMIT 1`;
    expect(audit).toMatchObject({
      actor_kind: 'public',
      facts: { participantCreated: false, registrationReused: true },
      before_state: { status: 'pending_payment' },
    });
    expect((audit.before_state as { passes: unknown[] }).passes).toHaveLength(2);
    expect(JSON.stringify(audit)).not.toMatch(PERSONAL);
  });

  it('creates a new registration when the only match is voided', async () => {
    const ids = await fixture();
    const voided = await existing(ids.event, 'voided', {
      email: 'ana@example.com',
      phone: '55 1234 5678',
    });

    const response = await register({ buyer: buyer(), passes: [{ passTypeId: ids.full }] }).expect(
      201,
    );

    const body = response.body as PublicRegistrationResult;
    expect(body.registrationId).not.toBe(voided);
    const [{ participants }] = await client<{ participants: number }[]>`
      SELECT count(*)::int AS participants FROM participants`;
    expect(participants).toBe(2);
  });

  it('keeps the public rate limit on the registration route', async () => {
    process.env.PUBLIC_RATE_LIMIT_LIMIT = '1';
    const limited = await compile();
    process.env.PUBLIC_RATE_LIMIT_LIMIT = '10000';
    try {
      await request(limited.getHttpServer()).post(ROUTE).send({}).expect(400);
      const response = await request(limited.getHttpServer()).post(ROUTE).send({}).expect(429);
      expect(response.headers['retry-after']).toBeDefined();
    } finally {
      await limited.close();
    }
  });
});
