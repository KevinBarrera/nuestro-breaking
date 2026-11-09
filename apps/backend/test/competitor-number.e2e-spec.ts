import { createHash, randomBytes, randomUUID } from 'node:crypto';
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
import { readTrustedOrigin } from '@/http';
import { PostgresHarness } from './support/postgres-harness';

jest.setTimeout(120_000);

type CheckInBody = { alreadyCheckedIn: boolean; competitorNumber?: number | null };
type Detail = { competitorNumbers: { activityId: string; competitorNumber: number }[] };

// Competitor numbers (#377): one per registration and competition, assigned on the first check-in
// into that competition or by an administrator, always as the competition's highest number plus
// one. The event check-in and workshop check-ins assign nothing.
describe('competitor number (e2e)', () => {
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
  beforeEach(async () => harness.reset());
  afterAll(async () => {
    await app?.close();
    await harness.stop();
  });

  // Passes: Full includes the workshop and both competitions (Competition, then Battle in the
  // agenda); Choice includes the workshop and makes Battle selectable; Workshop includes only the
  // workshop. Ana and Beto hold Full, Wen holds Workshop, Sol holds Choice without a selection, Pia
  // holds Full but is pending payment. Another event has its own registration and competition.
  async function fixture() {
    const [{ id: org }] = await client<{ id: string }[]>`
      INSERT INTO organizations (name) VALUES ('Org') RETURNING id`;
    const [event, other] = await client<{ id: string }[]>`
      INSERT INTO events (organization_id, name, time_zone)
      VALUES (${org}, 'One', 'Etc/UTC'), (${org}, 'Two', 'Etc/UTC') RETURNING id`;
    const [{ id: venue }] = await client<{ id: string }[]>`
      INSERT INTO venues (organization_id, name) VALUES (${org}, 'Hall') RETURNING id`;
    await client`
      INSERT INTO event_venues (organization_id, event_id, venue_id)
      VALUES (${org}, ${event.id}, ${venue}), (${org}, ${other.id}, ${venue})`;
    const [workshop, competition, battle, foreignCompetition] = await client<{ id: string }[]>`
      INSERT INTO activities (event_id, venue_id, kind, name, starts_at, ends_at)
      VALUES (${event.id}, ${venue}, 'workshop', 'Workshop', now(), now() + interval '1 hour'),
        (${event.id}, ${venue}, 'competition', 'Competition', now(), now() + interval '1 hour'),
        (${event.id}, ${venue}, 'competition', 'Battle', now() + interval '1 hour', now() + interval '2 hours'),
        (${other.id}, ${venue}, 'competition', 'Elsewhere', now(), now() + interval '1 hour')
      RETURNING id`;
    const [full, choice, workshopPass] = await client<{ id: string }[]>`
      INSERT INTO event_pass_types (event_id, name, pass_class, price_cents)
      VALUES (${event.id}, 'Full', 'full', 1000), (${event.id}, 'Choice', 'full', 900),
        (${event.id}, 'Workshop', 'add_on', 300)
      RETURNING id`;
    await client`
      INSERT INTO event_pass_type_activities (event_id, pass_type_id, activity_id, access)
      VALUES (${event.id}, ${full.id}, ${workshop.id}, 'included'),
        (${event.id}, ${full.id}, ${competition.id}, 'included'),
        (${event.id}, ${full.id}, ${battle.id}, 'included'),
        (${event.id}, ${choice.id}, ${workshop.id}, 'included'),
        (${event.id}, ${choice.id}, ${battle.id}, 'selectable'),
        (${event.id}, ${workshopPass.id}, ${workshop.id}, 'included')`;
    const register = async (eventId: string, name: string, confirmed: boolean) => {
      const [{ id }] = await client<{ id: string }[]>`
        WITH person AS (INSERT INTO participants (full_name) VALUES (${name}) RETURNING id)
        INSERT INTO event_registrations (event_id, participant_id, status, confirmation_source, confirmed_at, folio)
        SELECT ${eventId}, id, ${confirmed ? 'confirmed' : 'pending_payment'},
          ${confirmed ? 'admin_cash' : null}, CASE WHEN ${confirmed}::boolean THEN now() END,
          ${confirmed ? `F-${randomBytes(4).toString('hex')}` : null}
        FROM person RETURNING id`;
      return id;
    };
    const hold = async (registrationId: string, passTypeId: string) => {
      const [{ id }] = await client<{ id: string }[]>`
        INSERT INTO event_registration_passes (event_id, event_registration_id, pass_type_id, price_cents)
        VALUES (${event.id}, ${registrationId}, ${passTypeId}, 100) RETURNING id`;
      return id;
    };
    const ana = await register(event.id, 'Ana', true);
    const beto = await register(event.id, 'Beto', true);
    const wen = await register(event.id, 'Wen', true);
    const sol = await register(event.id, 'Sol', true);
    const pia = await register(event.id, 'Pia', false);
    await hold(ana, full.id);
    await hold(beto, full.id);
    await hold(wen, workshopPass.id);
    const solPass = await hold(sol, choice.id);
    await hold(pia, full.id);
    const foreign = await register(other.id, 'Foreign', true);
    return {
      event: event.id,
      other: other.id,
      workshop: workshop.id,
      competition: competition.id,
      battle: battle.id,
      foreignCompetition: foreignCompetition.id,
      ana,
      beto,
      wen,
      sol,
      solPass,
      pia,
      foreign,
    };
  }
  async function session(role: string, eventId: string) {
    const [{ id: userId }] = await client<{ id: string }[]>`
      INSERT INTO users (email, display_name, active)
      VALUES (${randomBytes(8).toString('hex') + '@example.com'}, 'Operator', true) RETURNING id`;
    await client`INSERT INTO user_roles (user_id, role, scope_type, scope_id) VALUES (${userId}, ${role}, 'event', ${eventId})`;
    const token = randomBytes(32).toString('hex');
    const [{ id: sessionId }] = await client<{ id: string }[]>`
      INSERT INTO auth_sessions (user_id, token_digest, expires_at)
      VALUES (${userId}, ${createHash('sha256').update(token).digest('hex')}, now() + interval '1 hour') RETURNING id`;
    return { cookie: `nb_admin_session=${token}`, userId, sessionId };
  }
  const origin = readTrustedOrigin(process.env);
  const headers = (cookie: string) => ({
    Cookie: cookie,
    Origin: origin,
    'X-CSRF-Token': createHash('sha256')
      .update(`nb-admin-csrf-v1:${cookie.slice('nb_admin_session='.length)}`)
      .digest('hex'),
  });
  const http = () => request(app.getHttpServer());
  const checkIn = (cookie: string, event: string, registration: string) =>
    http()
      .post(`/admin/events/${event}/registrations/${registration}/check-in`)
      .set(headers(cookie))
      .send({});
  const activityCheckIn = (cookie: string, event: string, registration: string, activity: string) =>
    http()
      .post(`/admin/events/${event}/registrations/${registration}/activities/${activity}/check-in`)
      .set(headers(cookie))
      .send({});
  const assign = (event: string, registration: string, activity: string) =>
    http().post(
      `/admin/events/${event}/registrations/${registration}/competitions/${activity}/competitor-number`,
    );
  // Every stored number as `registration:activity → number`.
  const numbers = async () =>
    Object.fromEntries(
      (
        await client<{ key: string; n: number }[]>`
          SELECT event_registration_id || ':' || activity_id AS key, competitor_number AS n
          FROM event_competitor_numbers`
      ).map((row) => [row.key, row.n]),
    );
  const numberOf = async (registration: string, activity: string) =>
    (
      await client<{ n: number }[]>`
        SELECT competitor_number AS n FROM event_competitor_numbers
        WHERE event_registration_id = ${registration} AND activity_id = ${activity}`
    )[0]?.n ?? null;
  const auditRows = () =>
    client`SELECT * FROM registration_operation_audit ORDER BY created_at, id`;
  const detail = async (cookie: string, event: string, registration: string) =>
    (
      await http()
        .get(`/admin/events/${event}/registrations/${registration}/entitlements`)
        .set(headers(cookie))
        .expect(200)
    ).body as Detail;
  const select = (
    cookie: string,
    s: { event: string; sol: string; solPass: string },
    ids: string[],
  ) =>
    http()
      .put(`/admin/events/${s.event}/registrations/${s.sol}/passes/${s.solPass}/selections`)
      .set(headers(cookie))
      .send({ activityIds: ids, reason: 'Changed the battle' })
      .expect(200);

  it('assigns number 1 on the first check-in into a competition, without an audit entry', async () => {
    const s = await fixture();
    const { cookie } = await session('admin', s.event);
    const response = await activityCheckIn(cookie, s.event, s.ana, s.competition).expect(201);
    expect(response.body).toMatchObject({
      registrationId: s.ana,
      activityId: s.competition,
      alreadyCheckedIn: false,
      competitorNumber: 1,
    });
    expect(await numbers()).toEqual({ [`${s.ana}:${s.competition}`]: 1 });
    expect(await auditRows()).toHaveLength(0);
    expect((await detail(cookie, s.event, s.ana)).competitorNumbers).toEqual([
      { activityId: s.competition, competitorNumber: 1 },
    ]);
  });

  it('assigns nothing on the event check-in or a workshop check-in', async () => {
    const s = await fixture();
    const { cookie } = await session('admin', s.event);
    const entry = await checkIn(cookie, s.event, s.ana).expect(201);
    expect(entry.body).not.toHaveProperty('competitorNumber');
    const workshop = await activityCheckIn(cookie, s.event, s.beto, s.workshop).expect(201);
    expect((workshop.body as CheckInBody).competitorNumber).toBeNull();
    await activityCheckIn(cookie, s.event, s.wen, s.workshop).expect(201);
    expect(await numbers()).toEqual({});
    expect((await detail(cookie, s.event, s.ana)).competitorNumbers).toEqual([]);
  });

  it('numbers each competition on its own, so one person may hold different or equal numbers', async () => {
    const s = await fixture();
    const { cookie } = await session('admin', s.event);
    const order: [string, string, number][] = [
      [s.ana, s.competition, 1],
      [s.beto, s.battle, 1],
      [s.ana, s.battle, 2],
      [s.beto, s.competition, 2],
    ];
    for (const [registration, activity, expected] of order) {
      const response = await activityCheckIn(cookie, s.event, registration, activity).expect(201);
      expect((response.body as CheckInBody).competitorNumber).toBe(expected);
    }
    // Agenda order: Competition, then Battle.
    expect((await detail(cookie, s.event, s.ana)).competitorNumbers).toEqual([
      { activityId: s.competition, competitorNumber: 1 },
      { activityId: s.battle, competitorNumber: 2 },
    ]);
    expect((await detail(cookie, s.event, s.beto)).competitorNumbers).toEqual([
      { activityId: s.competition, competitorNumber: 2 },
      { activityId: s.battle, competitorNumber: 1 },
    ]);
  });

  it('gives two concurrent check-ins into one competition different numbers', async () => {
    const s = await fixture();
    const { cookie } = await session('admin', s.event);
    // Hold the competition's assignment lock so both check-ins reach it before either reads `MAX`.
    const holder = await client.reserve();
    try {
      await holder`BEGIN`;
      await holder`SELECT pg_advisory_xact_lock(hashtext(${`competitor-number:${s.competition}`}))`;
      const pending = Promise.all([
        activityCheckIn(cookie, s.event, s.ana, s.competition),
        activityCheckIn(cookie, s.event, s.beto, s.competition),
      ]);
      for (let attempt = 0; attempt < 100; attempt += 1) {
        const [{ waiting }] = await client<{ waiting: number }[]>`
          SELECT count(*)::int AS waiting FROM pg_locks WHERE locktype = 'advisory' AND NOT granted`;
        if (waiting === 2) break;
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      await holder`COMMIT`;
      const results = await pending;
      expect(results.map((result) => result.status)).toEqual([201, 201]);
      const assigned = results.map((result) => (result.body as CheckInBody).competitorNumber);
      expect([...assigned].sort()).toEqual([1, 2]);
      expect(await numberOf(s.ana, s.competition)).toBe(assigned[0]);
      expect(await numberOf(s.beto, s.competition)).toBe(assigned[1]);
    } finally {
      holder.release();
    }
  });

  it('keeps the number on a repeated check-in into the competition', async () => {
    const s = await fixture();
    const { cookie } = await session('admin', s.event);
    await activityCheckIn(cookie, s.event, s.ana, s.competition).expect(201);
    const repeat = await activityCheckIn(cookie, s.event, s.ana, s.competition).expect(201);
    expect(repeat.body).toMatchObject({ alreadyCheckedIn: true, competitorNumber: 1 });
    expect(await numbers()).toEqual({ [`${s.ana}:${s.competition}`]: 1 });
  });

  it('numbers a selectable competition only once it is selected', async () => {
    const s = await fixture();
    const { cookie } = await session('admin', s.event);
    await activityCheckIn(cookie, s.event, s.sol, s.battle).expect(400);
    // Selecting the competition makes Sol a competitor there, but the selection assigns nothing.
    await select(cookie, s, [s.battle]);
    expect(await numbers()).toEqual({});
    const next = await activityCheckIn(cookie, s.event, s.sol, s.battle).expect(201);
    expect(next.body).toMatchObject({ activityId: s.battle, competitorNumber: 1 });
  });

  it('keeps the number after losing access to the competition', async () => {
    const s = await fixture();
    const { cookie } = await session('admin', s.event);
    await select(cookie, s, [s.battle]);
    await activityCheckIn(cookie, s.event, s.sol, s.battle).expect(201);
    await select(cookie, s, []);
    expect((await detail(cookie, s.event, s.sol)).competitorNumbers).toEqual([
      { activityId: s.battle, competitorNumber: 1 },
    ]);
    // An administrator can no longer give it a new one there.
    const rejected = await assign(s.event, s.sol, s.battle).set(headers(cookie)).expect(409);
    expect(rejected.body).toMatchObject({ code: 'competitor_number_not_eligible' });
    expect(await numberOf(s.sol, s.battle)).toBe(1);
  });

  it('keeps an admin assignment made before check-in on a later check-in', async () => {
    const s = await fixture();
    const { cookie, userId, sessionId } = await session('admin', s.event);
    const assigned = await assign(s.event, s.beto, s.battle).set(headers(cookie)).expect(201);
    expect(assigned.body).toEqual({
      registrationId: s.beto,
      activityId: s.battle,
      competitorNumber: 1,
      previousCompetitorNumber: null,
    });
    const [entry] = await auditRows();
    expect(entry).toMatchObject({
      event_id: s.event,
      registration_id: s.beto,
      operation_type: 'competitor_number_assignment',
      actor_kind: 'admin',
      actor_user_id: userId,
      session_id: sessionId,
      affected_activity_ids: [s.battle],
      before_state: { status: 'confirmed', activityId: s.battle, competitorNumber: null },
      after_state: { status: 'confirmed', activityId: s.battle, competitorNumber: 1 },
    });
    const later = await activityCheckIn(cookie, s.event, s.beto, s.battle).expect(201);
    expect(later.body).toMatchObject({ alreadyCheckedIn: false, competitorNumber: 1 });
    // The other competition is untouched: its first check-in still starts at 1.
    const other = await activityCheckIn(cookie, s.event, s.ana, s.competition).expect(201);
    expect((other.body as CheckInBody).competitorNumber).toBe(1);
    expect(await auditRows()).toHaveLength(1);
  });

  it('retires the old number on an admin change, audits it and never reuses a number', async () => {
    const s = await fixture();
    const { cookie } = await session('admin', s.event);
    await activityCheckIn(cookie, s.event, s.ana, s.battle).expect(201);
    await activityCheckIn(cookie, s.event, s.beto, s.battle).expect(201);
    await activityCheckIn(cookie, s.event, s.ana, s.competition).expect(201);
    const changed = await assign(s.event, s.ana, s.battle).set(headers(cookie)).expect(201);
    expect(changed.body).toEqual({
      registrationId: s.ana,
      activityId: s.battle,
      competitorNumber: 3,
      previousCompetitorNumber: 1,
    });
    const audit = await auditRows();
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      registration_id: s.ana,
      operation_type: 'competitor_number_assignment',
      before_state: { activityId: s.battle, competitorNumber: 1 },
      after_state: { activityId: s.battle, competitorNumber: 3 },
    });
    // Retired 1 is not handed out again: the next Battle competitor gets 4, so the gap stays.
    await select(cookie, s, [s.battle]);
    const next = await activityCheckIn(cookie, s.event, s.sol, s.battle).expect(201);
    expect((next.body as CheckInBody).competitorNumber).toBe(4);
    expect(await numbers()).toEqual({
      [`${s.ana}:${s.battle}`]: 3,
      [`${s.beto}:${s.battle}`]: 2,
      [`${s.sol}:${s.battle}`]: 4,
      [`${s.ana}:${s.competition}`]: 1,
    });
    const history = await http()
      .get(`/admin/events/${s.event}/registration-history`)
      .set(headers(cookie))
      .expect(200);
    const items = (history.body as { items: { operationType: string; details: unknown }[] }).items;
    expect(items.find((item) => item.operationType === 'competitor_number_assignment')).toEqual(
      expect.objectContaining({
        reason: null,
        details: {
          kind: 'competitor_number_assignment',
          activityName: 'Battle',
          previous: 1,
          current: 3,
        },
      }),
    );
  });

  it('rejects unknown, unconfirmed and ineligible assignments without writing', async () => {
    const s = await fixture();
    const { cookie } = await session('admin', s.event);
    await assign(s.event, randomUUID(), s.battle).set(headers(cookie)).expect(404);
    await assign(s.event, s.foreign, s.battle).set(headers(cookie)).expect(404);
    await assign(s.event, 'not-a-uuid', s.battle).set(headers(cookie)).expect(400);
    await assign(s.event, s.ana, 'not-a-uuid').set(headers(cookie)).expect(400);
    const pending = await assign(s.event, s.pia, s.battle).set(headers(cookie)).expect(409);
    expect(pending.body).toMatchObject({ code: 'competitor_number_not_confirmed' });
    await client`
      INSERT INTO activities (event_id, venue_id, kind, name, starts_at, ends_at, status)
      SELECT event_id, venue_id, 'competition', 'Archived', starts_at, ends_at, 'archived'
      FROM activities WHERE id = ${s.competition}`;
    const [{ id: archived }] = await client<{ id: string }[]>`
      SELECT id FROM activities WHERE name = 'Archived'`;
    const ineligible: [string, string][] = [
      [s.wen, s.battle], // no access
      [s.sol, s.battle], // selectable, not selected
      [s.ana, s.workshop], // not a competition
      [s.ana, s.foreignCompetition], // another event's competition
      [s.ana, randomUUID()], // unknown activity
      [s.ana, archived], // archived competition
    ];
    for (const [registration, activity] of ineligible) {
      const response = await assign(s.event, registration, activity)
        .set(headers(cookie))
        .expect(409);
      expect(response.body).toMatchObject({ code: 'competitor_number_not_eligible' });
    }
    expect(await numbers()).toEqual({});
    expect(await auditRows()).toHaveLength(0);
  });

  it('requires a scoped admin session, trusted origin and CSRF token', async () => {
    const s = await fixture();
    const admin = await session('admin', s.event);
    const judge = await session('judge', s.event);
    const outsider = await session('admin', s.other);
    const call = () => assign(s.event, s.ana, s.battle);
    await call().set('Origin', origin).expect(401);
    await call().set(headers(judge.cookie)).expect(401);
    await call().set(headers(outsider.cookie)).expect(401);
    await call()
      .set('Cookie', admin.cookie)
      .set('X-CSRF-Token', headers(admin.cookie)['X-CSRF-Token'])
      .expect(403);
    await call().set(headers(admin.cookie)).set('X-CSRF-Token', '0'.repeat(64)).expect(403);
    expect(await numbers()).toEqual({});
    expect(await auditRows()).toHaveLength(0);
  });

  it('enforces one positive number per registration and competition, unique there, in PostgreSQL', async () => {
    const s = await fixture();
    const insert = (registration: string, activity: string, value: number, event = s.event) =>
      client`
        INSERT INTO event_competitor_numbers (event_id, event_registration_id, activity_id, competitor_number)
        VALUES (${event}, ${registration}, ${activity}, ${value})`;
    await insert(s.ana, s.battle, 1);
    // The same number in another competition is fine.
    await insert(s.beto, s.competition, 1);
    await expect(insert(s.beto, s.battle, 1)).rejects.toMatchObject({
      constraint_name: 'event_competitor_numbers_activity_number_uq',
    });
    await expect(insert(s.ana, s.battle, 2)).rejects.toMatchObject({
      constraint_name: 'event_competitor_numbers_pk',
    });
    for (const value of [0, -3])
      await expect(insert(s.beto, s.battle, value)).rejects.toMatchObject({
        constraint_name: 'event_competitor_numbers_number_ck',
      });
    // Registration and competition must belong to the same event.
    await expect(insert(s.ana, s.foreignCompetition, 5)).rejects.toMatchObject({
      constraint_name: 'event_competitor_numbers_activity_fk',
    });
    await expect(insert(s.foreign, s.battle, 5)).rejects.toMatchObject({
      constraint_name: 'event_competitor_numbers_registration_fk',
    });
    expect(await numbers()).toEqual({
      [`${s.ana}:${s.battle}`]: 1,
      [`${s.beto}:${s.competition}`]: 1,
    });
  });
});
