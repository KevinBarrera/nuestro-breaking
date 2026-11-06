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

type CheckInBody = { alreadyCheckedIn: boolean; competitorNumber: number | null };

// Competitor numbers (#377): assigned on the first event or activity check-in of an eligible
// registration, or by an administrator, always as the event's highest number plus one.
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

  // Passes: Full includes the workshop and the competition; Choice makes Battle selectable;
  // Workshop includes only the workshop. Ana and Beto hold Full, Wen holds Workshop, Sol holds
  // Choice without a selection, Pia holds Full but is pending payment. Another event has its own
  // competitor holding number 1, which must not count.
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
    const [workshop, competition, battle] = await client<{ id: string }[]>`
      INSERT INTO activities (event_id, venue_id, kind, name, starts_at, ends_at)
      VALUES (${event.id}, ${venue}, 'workshop', 'Workshop', now(), now() + interval '1 hour'),
        (${event.id}, ${venue}, 'competition', 'Competition', now(), now() + interval '1 hour'),
        (${event.id}, ${venue}, 'competition', 'Battle', now(), now() + interval '1 hour')
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
    await client`UPDATE event_registrations SET competitor_number = 1 WHERE id = ${foreign}`;
    return {
      event: event.id,
      other: other.id,
      workshop: workshop.id,
      competition: competition.id,
      battle: battle.id,
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
  const assign = (event: string, registration: string) =>
    http().post(`/admin/events/${event}/registrations/${registration}/competitor-number`);
  const numbers = async (event: string) =>
    Object.fromEntries(
      (
        await client<{ id: string; competitor_number: number | null }[]>`
          SELECT id, competitor_number FROM event_registrations WHERE event_id = ${event}`
      ).map((row) => [row.id, row.competitor_number]),
    );
  const numberOf = async (registration: string) =>
    (
      await client<{ n: number | null }[]>`
        SELECT competitor_number AS n FROM event_registrations WHERE id = ${registration}`
    )[0].n;
  const auditRows = () =>
    client`SELECT * FROM registration_operation_audit ORDER BY created_at, id`;

  it('assigns number 1 on the first event check-in of a competitor, without an audit entry', async () => {
    const s = await fixture();
    const { cookie } = await session('admin', s.event);
    const response = await checkIn(cookie, s.event, s.ana).expect(201);
    expect(response.body).toMatchObject({
      eventId: s.event,
      registrationId: s.ana,
      alreadyCheckedIn: false,
      competitorNumber: 1,
    });
    expect(await numbers(s.event)).toEqual({
      [s.ana]: 1,
      [s.beto]: null,
      [s.wen]: null,
      [s.sol]: null,
      [s.pia]: null,
    });
    expect(await numberOf(s.foreign)).toBe(1);
    expect(await auditRows()).toHaveLength(0);
    const detail = await http()
      .get(`/admin/events/${s.event}/registrations/${s.ana}/entitlements`)
      .set(headers(cookie))
      .expect(200);
    expect((detail.body as { competitorNumber: number | null }).competitorNumber).toBe(1);
  });

  it('assigns a number on a first workshop check-in', async () => {
    const s = await fixture();
    const { cookie } = await session('admin', s.event);
    const response = await activityCheckIn(cookie, s.event, s.beto, s.workshop).expect(201);
    expect(response.body).toMatchObject({
      registrationId: s.beto,
      activityId: s.workshop,
      alreadyCheckedIn: false,
      competitorNumber: 1,
    });
    expect(await numberOf(s.beto)).toBe(1);
    expect(await auditRows()).toHaveLength(0);
  });

  it('gives no number without a competition pass or a selected competition', async () => {
    const s = await fixture();
    const { cookie } = await session('admin', s.event);
    for (const response of [
      await checkIn(cookie, s.event, s.wen).expect(201),
      await activityCheckIn(cookie, s.event, s.sol, s.workshop).expect(201),
    ])
      expect((response.body as CheckInBody).competitorNumber).toBeNull();
    expect(await numberOf(s.wen)).toBeNull();
    expect(await numberOf(s.sol)).toBeNull();
    const detail = await http()
      .get(`/admin/events/${s.event}/registrations/${s.wen}/entitlements`)
      .set(headers(cookie))
      .expect(200);
    expect((detail.body as { competitorNumber: number | null }).competitorNumber).toBeNull();
  });

  it('gives two concurrent check-ins of different registrations different numbers', async () => {
    const s = await fixture();
    const { cookie } = await session('admin', s.event);
    // Hold the event's assignment lock so both check-ins reach it before either reads `MAX`.
    const holder = await client.reserve();
    try {
      await holder`BEGIN`;
      await holder`SELECT pg_advisory_xact_lock(hashtext(${`competitor-number:${s.event}`}))`;
      const pending = Promise.all([
        checkIn(cookie, s.event, s.ana),
        activityCheckIn(cookie, s.event, s.beto, s.workshop),
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
      expect(await numberOf(s.ana)).toBe(assigned[0]);
      expect(await numberOf(s.beto)).toBe(assigned[1]);
    } finally {
      holder.release();
    }
  });

  it('keeps the number on a repeated check-in', async () => {
    const s = await fixture();
    const { cookie } = await session('admin', s.event);
    await checkIn(cookie, s.event, s.ana).expect(201);
    const repeat = await checkIn(cookie, s.event, s.ana).expect(201);
    expect(repeat.body).toMatchObject({ alreadyCheckedIn: true, competitorNumber: 1 });
    const workshop = await activityCheckIn(cookie, s.event, s.ana, s.workshop).expect(201);
    expect(workshop.body).toMatchObject({ competitorNumber: 1 });
    expect(await numbers(s.event)).toMatchObject({ [s.ana]: 1, [s.beto]: null });
  });

  it('gives a registration that becomes eligible after check-in a number on its next check-in', async () => {
    const s = await fixture();
    const { cookie } = await session('admin', s.event);
    const first = await checkIn(cookie, s.event, s.sol).expect(201);
    expect((first.body as CheckInBody).competitorNumber).toBeNull();
    // Selecting the competition makes Sol a competitor, but the selection change assigns nothing.
    await http()
      .put(`/admin/events/${s.event}/registrations/${s.sol}/passes/${s.solPass}/selections`)
      .set(headers(cookie))
      .send({ activityIds: [s.battle], reason: 'Chose the battle' })
      .expect(200);
    expect(await numberOf(s.sol)).toBeNull();
    const next = await activityCheckIn(cookie, s.event, s.sol, s.battle).expect(201);
    expect(next.body).toMatchObject({ activityId: s.battle, competitorNumber: 1 });
    expect(await numberOf(s.sol)).toBe(1);
  });

  it('keeps the number after losing eligibility', async () => {
    const s = await fixture();
    const { cookie } = await session('admin', s.event);
    await checkIn(cookie, s.event, s.ana).expect(201);
    await client`UPDATE activities SET status = 'archived' WHERE id = ${s.competition}`;
    const later = await activityCheckIn(cookie, s.event, s.ana, s.workshop).expect(201);
    expect((later.body as CheckInBody).competitorNumber).toBe(1);
    expect(await numberOf(s.ana)).toBe(1);
    // An administrator can no longer give it a new one.
    const { cookie: admin } = await session('admin', s.event);
    const rejected = await assign(s.event, s.ana).set(headers(admin)).expect(409);
    expect(rejected.body).toMatchObject({ code: 'competitor_number_not_eligible' });
    expect(await numberOf(s.ana)).toBe(1);
  });

  it('keeps an admin assignment made before check-in on a later check-in', async () => {
    const s = await fixture();
    const { cookie, userId, sessionId } = await session('admin', s.event);
    const assigned = await assign(s.event, s.beto).set(headers(cookie)).expect(201);
    expect(assigned.body).toEqual({
      registrationId: s.beto,
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
      before_state: { status: 'confirmed', competitorNumber: null },
      after_state: { status: 'confirmed', competitorNumber: 1 },
    });
    const later = await checkIn(cookie, s.event, s.beto).expect(201);
    expect(later.body).toMatchObject({ alreadyCheckedIn: false, competitorNumber: 1 });
    expect(await numberOf(s.beto)).toBe(1);
    expect(await auditRows()).toHaveLength(1);
  });

  it('retires the old number on an admin change, audits it and never reuses a number', async () => {
    const s = await fixture();
    const { cookie } = await session('admin', s.event);
    await checkIn(cookie, s.event, s.ana).expect(201);
    await checkIn(cookie, s.event, s.beto).expect(201);
    const changed = await assign(s.event, s.ana).set(headers(cookie)).expect(201);
    expect(changed.body).toEqual({
      registrationId: s.ana,
      competitorNumber: 3,
      previousCompetitorNumber: 1,
    });
    const audit = await auditRows();
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      registration_id: s.ana,
      operation_type: 'competitor_number_assignment',
      before_state: { competitorNumber: 1 },
      after_state: { competitorNumber: 3 },
    });
    // Retired 1 is not handed out again: the next competitor gets 4, so the gap stays.
    await http()
      .put(`/admin/events/${s.event}/registrations/${s.sol}/passes/${s.solPass}/selections`)
      .set(headers(cookie))
      .send({ activityIds: [s.battle], reason: 'Chose the battle' })
      .expect(200);
    const next = await checkIn(cookie, s.event, s.sol).expect(201);
    expect((next.body as CheckInBody).competitorNumber).toBe(4);
    expect(await numbers(s.event)).toEqual({
      [s.ana]: 3,
      [s.beto]: 2,
      [s.wen]: null,
      [s.sol]: 4,
      [s.pia]: null,
    });
    const history = await http()
      .get(`/admin/events/${s.event}/registration-history`)
      .set(headers(cookie))
      .expect(200);
    const items = (history.body as { items: { operationType: string; details: unknown }[] }).items;
    expect(items.find((item) => item.operationType === 'competitor_number_assignment')).toEqual(
      expect.objectContaining({
        reason: null,
        details: { kind: 'competitor_number_assignment', previous: 1, current: 3 },
      }),
    );
  });

  it('rejects unknown, unconfirmed and ineligible registrations without writing', async () => {
    const s = await fixture();
    const { cookie } = await session('admin', s.event);
    const before = await numbers(s.event);
    await assign(s.event, randomUUID()).set(headers(cookie)).expect(404);
    await assign(s.event, s.foreign).set(headers(cookie)).expect(404);
    const pending = await assign(s.event, s.pia).set(headers(cookie)).expect(409);
    expect(pending.body).toMatchObject({ code: 'competitor_number_not_confirmed' });
    for (const id of [s.wen, s.sol]) {
      const ineligible = await assign(s.event, id).set(headers(cookie)).expect(409);
      expect(ineligible.body).toMatchObject({ code: 'competitor_number_not_eligible' });
    }
    expect(await numbers(s.event)).toEqual(before);
    expect(await numberOf(s.foreign)).toBe(1);
    expect(await auditRows()).toHaveLength(0);
  });

  it('requires a scoped admin session, trusted origin and CSRF token', async () => {
    const s = await fixture();
    const admin = await session('admin', s.event);
    const judge = await session('judge', s.event);
    const outsider = await session('admin', s.other);
    await assign(s.event, s.ana).set('Origin', origin).expect(401);
    await assign(s.event, s.ana).set(headers(judge.cookie)).expect(401);
    await assign(s.event, s.ana).set(headers(outsider.cookie)).expect(401);
    await assign(s.event, s.ana)
      .set('Cookie', admin.cookie)
      .set('X-CSRF-Token', headers(admin.cookie)['X-CSRF-Token'])
      .expect(403);
    await assign(s.event, s.ana)
      .set(headers(admin.cookie))
      .set('X-CSRF-Token', '0'.repeat(64))
      .expect(403);
    expect(await numberOf(s.ana)).toBeNull();
    expect(await auditRows()).toHaveLength(0);
  });

  it('enforces a positive number unique within the event in PostgreSQL', async () => {
    const s = await fixture();
    await client`UPDATE event_registrations SET competitor_number = 1 WHERE id = ${s.ana}`;
    await expect(
      client`UPDATE event_registrations SET competitor_number = 1 WHERE id = ${s.beto}`,
    ).rejects.toMatchObject({ constraint_name: 'event_registrations_event_competitor_number_uq' });
    for (const value of [0, -3])
      await expect(
        client`UPDATE event_registrations SET competitor_number = ${value} WHERE id = ${s.beto}`,
      ).rejects.toMatchObject({ constraint_name: 'event_registrations_competitor_number_ck' });
    expect(await numberOf(s.beto)).toBeNull();
  });
});
