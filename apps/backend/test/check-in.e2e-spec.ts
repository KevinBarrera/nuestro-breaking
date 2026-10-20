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

describe('event check-in (e2e)', () => {
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

  async function fixture() {
    const [{ id: org }] = await client<{ id: string }[]>`
      INSERT INTO organizations (name) VALUES ('Org') RETURNING id`;
    const [event, other] = await client<{ id: string }[]>`
      INSERT INTO events (organization_id, name, time_zone)
      VALUES (${org}, 'One', 'Etc/UTC'), (${org}, 'Two', 'Etc/UTC') RETURNING id`;
    await client`
      WITH people AS (
        INSERT INTO participants (full_name) VALUES ('Confirmed'), ('Pending'), ('Voided'), ('Foreign') RETURNING id, full_name
      )
      INSERT INTO event_registrations (event_id, participant_id, status, confirmation_source, confirmed_at)
      SELECT CASE WHEN full_name = 'Foreign' THEN ${other.id}::uuid ELSE ${event.id}::uuid END,
        id, CASE WHEN full_name = 'Confirmed' OR full_name = 'Foreign' THEN 'confirmed'
          WHEN full_name = 'Voided' THEN 'voided' ELSE 'pending_payment' END,
        CASE WHEN full_name = 'Confirmed' OR full_name = 'Foreign' THEN 'admin_cash' ELSE NULL END,
        CASE WHEN full_name = 'Confirmed' OR full_name = 'Foreign' THEN now() ELSE NULL END
      FROM people ORDER BY CASE full_name WHEN 'Confirmed' THEN 1 WHEN 'Pending' THEN 2 WHEN 'Voided' THEN 3 ELSE 4 END
      RETURNING id`;
    const registrations = await client<{ id: string; full_name: string }[]>`
      SELECT r.id, p.full_name FROM event_registrations r
      JOIN participants p ON p.id = r.participant_id`;
    const id = (name: string) => registrations.find((row) => row.full_name === name)!.id;
    return {
      event: event.id,
      other: other.id,
      confirmed: id('Confirmed'),
      pending: id('Pending'),
      voided: id('Voided'),
      foreign: id('Foreign'),
    };
  }
  // Access comes from passes: Full includes the workshop, battle, social and archived activities
  // and makes Competition and Unselected selectable; General grants nothing. No legacy enrollments.
  async function activityFixture() {
    const registrations = await fixture();
    const [{ id: org }] = await client<{ id: string }[]>`
      SELECT organization_id AS id FROM events WHERE id = ${registrations.event}`;
    const [{ id: venue }] = await client<{ id: string }[]>`
      INSERT INTO venues (organization_id, name) VALUES (${org}, 'Hall') RETURNING id`;
    await client`
      INSERT INTO event_venues (organization_id, event_id, venue_id)
      VALUES (${org}, ${registrations.event}, ${venue}), (${org}, ${registrations.other}, ${venue})`;
    const [workshop, competition, battle, social, archived, unselected] = await client<
      { id: string }[]
    >`
      INSERT INTO activities (event_id, venue_id, kind, name, starts_at, ends_at, status)
      VALUES (${registrations.event}, ${venue}, 'workshop', 'Workshop', now(), now() + interval '1 hour', 'active'),
        (${registrations.event}, ${venue}, 'competition', 'Competition', now(), now() + interval '1 hour', 'active'),
        (${registrations.event}, ${venue}, 'competition', 'Battle', now(), now() + interval '1 hour', 'active'),
        (${registrations.event}, ${venue}, 'social', 'Social', now(), now() + interval '1 hour', 'active'),
        (${registrations.event}, ${venue}, 'workshop', 'Archived', now(), now() + interval '1 hour', 'archived'),
        (${registrations.event}, ${venue}, 'competition', 'Unselected', now(), now() + interval '1 hour', 'active')
      RETURNING id`;
    const [{ id: foreignActivity }] = await client<{ id: string }[]>`
      INSERT INTO activities (event_id, venue_id, kind, name, starts_at, ends_at)
      VALUES (${registrations.other}, ${venue}, 'workshop', 'Foreign', now(), now() + interval '1 hour') RETURNING id`;
    const [full, generalPass] = await client<{ id: string }[]>`
      INSERT INTO event_pass_types (event_id, name, pass_class, price_cents)
      VALUES (${registrations.event}, 'Full', 'full', 1000), (${registrations.event}, 'General', 'general', 300)
      RETURNING id`;
    const [{ id: foreignPass }] = await client<{ id: string }[]>`
      INSERT INTO event_pass_types (event_id, name, pass_class, price_cents)
      VALUES (${registrations.other}, 'Foreign pass', 'full', 1000) RETURNING id`;
    await client`
      INSERT INTO event_pass_type_activities (event_id, pass_type_id, activity_id, access)
      VALUES (${registrations.event}, ${full.id}, ${workshop.id}, 'included'),
        (${registrations.event}, ${full.id}, ${battle.id}, 'included'),
        (${registrations.event}, ${full.id}, ${social.id}, 'included'),
        (${registrations.event}, ${full.id}, ${archived.id}, 'included'),
        (${registrations.event}, ${full.id}, ${competition.id}, 'selectable'),
        (${registrations.event}, ${full.id}, ${unselected.id}, 'selectable'),
        (${registrations.other}, ${foreignPass}, ${foreignActivity}, 'included')`;
    const [{ id: general }] = await client<{ id: string }[]>`
      WITH person AS (INSERT INTO participants (full_name) VALUES ('General') RETURNING id)
      INSERT INTO event_registrations (event_id, participant_id, status, confirmation_source, confirmed_at)
      SELECT ${registrations.event}, id, 'confirmed', 'admin_cash', now() FROM person RETURNING id`;
    const holdings: [string, string, string][] = [
      [registrations.event, registrations.confirmed, full.id],
      [registrations.event, registrations.pending, full.id],
      [registrations.event, registrations.voided, full.id],
      [registrations.event, general, generalPass.id],
      [registrations.other, registrations.foreign, foreignPass],
    ];
    const held: string[] = [];
    for (const [eventId, registrationId, passTypeId] of holdings) {
      const [{ id }] = await client<{ id: string }[]>`
        INSERT INTO event_registration_passes (event_id, event_registration_id, pass_type_id, price_cents)
        VALUES (${eventId}, ${registrationId}, ${passTypeId}, 100) RETURNING id`;
      held.push(id);
    }
    await client`
      INSERT INTO event_registration_pass_selections (event_id, registration_pass_id, activity_id)
      VALUES (${registrations.event}, ${held[0]}, ${competition.id})`;
    return {
      ...registrations,
      workshop: workshop.id,
      competition: competition.id,
      battle: battle.id,
      social: social.id,
      archived: archived.id,
      unselected: unselected.id,
      foreignActivity,
      general,
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
  const checkIn = (event: string, registration: string) =>
    request(app.getHttpServer()).post(
      `/admin/events/${event}/registrations/${registration}/check-in`,
    );
  const rows = () => client`SELECT * FROM event_check_ins`;
  const activityCheckIn = (event: string, registration: string, activity: string) =>
    request(app.getHttpServer()).post(
      `/admin/events/${event}/registrations/${registration}/activities/${activity}/check-in`,
    );
  const activityRows = () => client`SELECT * FROM activity_check_ins ORDER BY activity_id`;

  const enrollmentRows = () =>
    client`SELECT * FROM event_activity_registrations ORDER BY activity_id`;
  const snapshot = async () => ({
    registrations: await client`SELECT * FROM event_registrations ORDER BY id`,
    events: await rows(),
    enrollments: await enrollmentRows(),
    activities: await activityRows(),
  });

  it('records the event fact, enrollment and activity fact in one action from an included pass activity', async () => {
    const { event, confirmed, workshop } = await activityFixture();
    const { cookie, userId, sessionId } = await session('admin', event);
    const before = await client`SELECT * FROM event_registrations ORDER BY id`;
    expect(await rows()).toHaveLength(0);
    expect(await enrollmentRows()).toHaveLength(0);
    const start = Date.now();
    const result = await activityCheckIn(event, confirmed, workshop)
      .set(headers(cookie))
      .send({})
      .expect(201);
    const end = Date.now();
    const [eventFact] = await rows();
    const [enrollment] = await enrollmentRows();
    const [fact] = await activityRows();
    expect(result.body).toEqual({
      id: fact.id as string,
      eventId: event,
      registrationId: confirmed,
      activityId: workshop,
      checkedInAt: new Date(fact.checked_in_at as string).toISOString(),
      alreadyCheckedIn: false,
    });
    expect(eventFact).toMatchObject({
      event_id: event,
      event_registration_id: confirmed,
      actor_user_id: userId,
      session_id: sessionId,
    });
    expect(enrollment).toMatchObject({
      event_id: event,
      event_registration_id: confirmed,
      activity_id: workshop,
    });
    expect(fact).toMatchObject({
      event_id: event,
      event_registration_id: confirmed,
      activity_id: workshop,
      enrollment_id: enrollment.id as string,
      event_check_in_id: eventFact.id as string,
      actor_user_id: userId,
      session_id: sessionId,
    });
    expect(new Date(fact.checked_in_at as string).getTime()).toBeGreaterThanOrEqual(start - 5000);
    expect(new Date(fact.checked_in_at as string).getTime()).toBeLessThanOrEqual(end + 5000);
    expect(await client`SELECT * FROM event_registrations ORDER BY id`).toEqual(before);
  });

  it('reuses the event fact and an existing enrollment for selected and included activities', async () => {
    const { event, confirmed, workshop, competition, battle } = await activityFixture();
    const { cookie } = await session('admin', event);
    const [legacy] = await client`
      INSERT INTO event_activity_registrations (event_id, event_registration_id, activity_id)
      VALUES (${event}, ${confirmed}, ${battle}) RETURNING *`;
    await checkIn(event, confirmed).set(headers(cookie)).send({}).expect(201);
    const [eventFact] = await rows();
    for (const activity of [competition, battle, workshop]) {
      const result = await activityCheckIn(event, confirmed, activity)
        .set(headers(cookie))
        .send({})
        .expect(201);
      expect(result.body).toMatchObject({ activityId: activity, alreadyCheckedIn: false });
    }
    expect(await rows()).toEqual([eventFact]);
    const enrollments = await enrollmentRows();
    expect(enrollments).toHaveLength(3);
    expect(enrollments).toContainEqual(legacy);
    const facts = await activityRows();
    expect(facts).toHaveLength(3);
    for (const fact of facts) expect(fact.event_check_in_id).toBe(eventFact.id);
    expect(facts.find((fact) => fact.activity_id === battle)!.enrollment_id).toBe(legacy.id);
  });

  it('denies activities without pass access, archived, general-only, foreign, pending and voided without mutation', async () => {
    const f = await activityFixture();
    const { cookie } = await session('admin', f.event);
    await client`
      INSERT INTO event_activity_registrations (event_id, event_registration_id, activity_id)
      VALUES (${f.event}, ${f.general}, ${f.workshop})`;
    const before = await snapshot();
    for (const [registration, activity] of [
      [f.confirmed, f.unselected],
      [f.confirmed, f.archived],
      [f.confirmed, f.foreignActivity],
      [f.confirmed, randomUUID()],
      [f.general, f.workshop],
      [f.pending, f.workshop],
      [f.voided, f.workshop],
      [f.foreign, f.workshop],
    ]) {
      const response = await activityCheckIn(f.event, registration, activity)
        .set(headers(cookie))
        .send({})
        .expect(400);
      expect((response.body as { message: string }).message).toMatch(/registration|access/i);
    }
    expect(await snapshot()).toEqual(before);
  });

  it('denies an included activity whose kind is not eligible without mutation', async () => {
    const f = await activityFixture();
    const { cookie } = await session('admin', f.event);
    const before = await snapshot();
    const response = await activityCheckIn(f.event, f.confirmed, f.social)
      .set(headers(cookie))
      .send({})
      .expect(400);
    expect((response.body as { message: string }).message).toBe(
      'Activity kind is not eligible for check-in',
    );
    expect(await snapshot()).toEqual(before);
  });

  it('returns the original activity fact on a repeat without new rows', async () => {
    const f = await activityFixture();
    const first = await session('admin', f.event);
    const second = await session('admin', f.event);
    const created = await activityCheckIn(f.event, f.confirmed, f.workshop)
      .set(headers(first.cookie))
      .send({})
      .expect(201);
    const before = await snapshot();
    const repeat = await activityCheckIn(f.event, f.confirmed, f.workshop)
      .set(headers(second.cookie))
      .send({})
      .expect(201);
    expect(repeat.body).toEqual({
      ...(created.body as object),
      alreadyCheckedIn: true,
    });
    expect(await snapshot()).toEqual(before);
    expect(before.activities[0]).toMatchObject({
      actor_user_id: first.userId,
      session_id: first.sessionId,
    });
  });

  it('denies unauthorized activity requests and records concurrent duplicates once', async () => {
    const f = await activityFixture();
    const admin = await session('admin', f.event);
    const judge = await session('judge', f.event);
    await activityCheckIn(f.event, f.confirmed, f.workshop)
      .set('Origin', origin)
      .send({})
      .expect(401);
    await activityCheckIn(f.event, f.confirmed, f.workshop)
      .set(headers(judge.cookie))
      .send({})
      .expect(401);
    await activityCheckIn(f.other, f.confirmed, f.workshop)
      .set(headers(admin.cookie))
      .send({})
      .expect(401);
    await activityCheckIn(f.event, f.confirmed, f.workshop)
      .set(headers(admin.cookie))
      .set('Origin', 'https://untrusted.example')
      .send({})
      .expect(403);
    await activityCheckIn(f.event, f.confirmed, f.workshop)
      .set(headers(admin.cookie))
      .set('X-CSRF-Token', '0'.repeat(64))
      .send({})
      .expect(403);
    expect(await activityRows()).toHaveLength(0);
    const results = await Promise.all([
      activityCheckIn(f.event, f.confirmed, f.workshop).set(headers(admin.cookie)).send({}),
      activityCheckIn(f.event, f.confirmed, f.workshop).set(headers(admin.cookie)).send({}),
    ]);
    expect(results.map((result) => result.status)).toEqual([201, 201]);
    expect(
      results
        .map((result) => (result.body as { alreadyCheckedIn: boolean }).alreadyCheckedIn)
        .sort(),
    ).toEqual([false, true]);
    expect(results[0].body).toMatchObject({ id: (results[1].body as { id: string }).id });
    expect(await rows()).toHaveLength(1);
    expect(await enrollmentRows()).toHaveLength(1);
    expect(await activityRows()).toHaveLength(1);
  });

  it('shares one event fact between concurrent first check-ins to different activities', async () => {
    const f = await activityFixture();
    const { cookie } = await session('admin', f.event);
    const results = await Promise.all(
      [f.workshop, f.competition].map((activity) =>
        activityCheckIn(f.event, f.confirmed, activity).set(headers(cookie)).send({}),
      ),
    );
    expect(results.map((result) => result.status)).toEqual([201, 201]);
    const [eventFact] = await rows();
    expect(await rows()).toHaveLength(1);
    const facts = await activityRows();
    expect(facts).toHaveLength(2);
    for (const fact of facts) expect(fact.event_check_in_id).toBe(eventFact.id);
  });

  it('rejects direct SQL check-in for an enrolled social activity after valid event admission', async () => {
    const f = await activityFixture();
    const { cookie, userId, sessionId } = await session('admin', f.event);
    const [{ id: enrollmentId }] = await client<{ id: string }[]>`
      INSERT INTO event_activity_registrations (event_id, event_registration_id, activity_id)
      VALUES (${f.event}, ${f.confirmed}, ${f.social}) RETURNING id`;
    const admission = await checkIn(f.event, f.confirmed).set(headers(cookie)).send({}).expect(201);
    const eventFactId = (admission.body as { id: string }).id;
    const registrations = await client`SELECT * FROM event_registrations ORDER BY id`;
    const enrollments = await enrollmentRows();
    await expect(client`
      INSERT INTO activity_check_ins (event_id, event_registration_id, activity_id,
        enrollment_id, event_check_in_id, actor_user_id, session_id)
      VALUES (${f.event}, ${f.confirmed}, ${f.social}, ${enrollmentId}, ${eventFactId},
        ${userId}, ${sessionId})
    `).rejects.toThrow('activity check-in requires a workshop or competition');
    expect(await activityRows()).toHaveLength(0);
    expect(await client`SELECT * FROM event_registrations ORDER BY id`).toEqual(registrations);
    expect(await enrollmentRows()).toEqual(enrollments);
  });

  it('enforces enrollment, event admission, session ownership, server time and immutability in PostgreSQL', async () => {
    const f = await activityFixture();
    const { cookie, userId, sessionId } = await session('admin', f.event);
    const insert = (
      eventId: string,
      registrationId: string,
      activityId: string,
      enrollmentId: string,
      eventCheckInId: string,
      actor = userId,
    ) => client`
      INSERT INTO activity_check_ins (event_id, event_registration_id, activity_id,
        enrollment_id, event_check_in_id, actor_user_id, session_id)
      VALUES (${eventId}, ${registrationId}, ${activityId}, ${enrollmentId}, ${eventCheckInId}, ${actor}, ${sessionId})`;
    const [{ id: enrollmentId }] = await client<{ id: string }[]>`
      INSERT INTO event_activity_registrations (event_id, event_registration_id, activity_id)
      VALUES (${f.event}, ${f.confirmed}, ${f.workshop}) RETURNING id`;
    await expect(
      insert(f.event, f.confirmed, f.workshop, enrollmentId, randomUUID()),
    ).rejects.toMatchObject({ code: '23503' });
    const eventResult = await checkIn(f.event, f.confirmed)
      .set(headers(cookie))
      .send({})
      .expect(201);
    const eventFactId = (eventResult.body as { id: string }).id;
    await expect(
      insert(f.event, f.confirmed, f.competition, enrollmentId, eventFactId),
    ).rejects.toMatchObject({ code: '23503' });
    await expect(
      insert(f.other, f.confirmed, f.workshop, enrollmentId, eventFactId),
    ).rejects.toThrow('activity check-in requires a confirmed registration in this event');
    const [{ id: stranger }] = await client<{ id: string }[]>`
      INSERT INTO users (email, display_name) VALUES ('stranger@example.com', 'Stranger') RETURNING id`;
    await expect(
      insert(f.event, f.confirmed, f.workshop, enrollmentId, eventFactId, stranger),
    ).rejects.toThrow('activity check-in actor must own the session');
    const start = Date.now();
    const [fact] = await client<{ checked_in_at: string }[]>`
      INSERT INTO activity_check_ins (event_id, event_registration_id, activity_id,
        enrollment_id, event_check_in_id, actor_user_id, session_id, checked_in_at)
      VALUES (${f.event}, ${f.confirmed}, ${f.workshop}, ${enrollmentId}, ${eventFactId},
        ${userId}, ${sessionId}, '2000-01-01') RETURNING checked_in_at`;
    expect(new Date(fact.checked_in_at).getTime()).toBeGreaterThanOrEqual(start - 5000);
    await expect(
      insert(f.event, f.confirmed, f.workshop, enrollmentId, eventFactId),
    ).rejects.toMatchObject({ code: '23505' });
    await expect(client`UPDATE activity_check_ins SET checked_in_at = now()`).rejects.toThrow();
    await expect(client`DELETE FROM activity_check_ins`).rejects.toThrow();
    expect(await activityRows()).toHaveLength(1);
  });

  it('records exactly one event-scoped fact with server time and authenticated actor/session, without changing registration', async () => {
    const { event, confirmed } = await fixture();
    const { cookie, userId, sessionId } = await session('admin', event);
    const before = await client`SELECT * FROM event_registrations WHERE id = ${confirmed}`;
    const start = new Date();
    const result = await checkIn(event, confirmed).set(headers(cookie)).send({}).expect(201);
    const end = new Date();
    const body = result.body as { id: string; eventId: string; registrationId: string };
    expect(body).toMatchObject({ eventId: event, registrationId: confirmed });
    const [fact] = await client<
      {
        id: string;
        event_id: string;
        event_registration_id: string;
        actor_user_id: string;
        session_id: string;
        checked_in_at: string;
      }[]
    >`SELECT * FROM event_check_ins WHERE event_registration_id = ${confirmed}`;
    expect(fact).toMatchObject({
      id: body.id,
      event_id: event,
      event_registration_id: confirmed,
      actor_user_id: userId,
      session_id: sessionId,
    });
    expect(new Date(fact.checked_in_at).getTime()).toBeGreaterThanOrEqual(start.getTime() - 5_000);
    expect(new Date(fact.checked_in_at).getTime()).toBeLessThanOrEqual(end.getTime() + 5_000);
    expect(await client`SELECT * FROM event_registrations WHERE id = ${confirmed}`).toEqual(before);
    expect(body).toMatchObject({ alreadyCheckedIn: false });
  });

  it('returns the original event fact on a repeat without a new row', async () => {
    const { event, confirmed } = await fixture();
    const first = await session('admin', event);
    const second = await session('admin', event);
    const created = await checkIn(event, confirmed).set(headers(first.cookie)).send({}).expect(201);
    const before = await rows();
    const repeat = await checkIn(event, confirmed).set(headers(second.cookie)).send({}).expect(201);
    expect(repeat.body).toEqual({ ...(created.body as object), alreadyCheckedIn: true });
    expect(await rows()).toEqual(before);
    expect(before[0]).toMatchObject({ actor_user_id: first.userId, session_id: first.sessionId });
  });

  it('denies pending, voided and wrong-event registrations without writing check-ins or changing registration state', async () => {
    const { event, pending, voided, foreign } = await fixture();
    const { cookie } = await session('admin', event);
    const before = await client`SELECT * FROM event_registrations ORDER BY id`;
    for (const id of [pending, voided, foreign]) {
      const response = await checkIn(event, id).set(headers(cookie)).send({}).expect(400);
      expect((response.body as { message: string }).message).toMatch(/registration|check-in/i);
    }
    expect(await rows()).toHaveLength(0);
    expect(await client`SELECT * FROM event_registrations ORDER BY id`).toEqual(before);
  });

  it('requires scoped admin session, trusted origin and session CSRF without writing a check-in', async () => {
    const { event, other, confirmed } = await fixture();
    const admin = await session('admin', event);
    const judge = await session('judge', event);
    await checkIn(event, confirmed).set('Origin', origin).send({}).expect(401);
    await checkIn(event, confirmed).set(headers(judge.cookie)).send({}).expect(401);
    await checkIn(other, confirmed).set(headers(admin.cookie)).send({}).expect(401);
    await checkIn(event, confirmed)
      .set('Cookie', admin.cookie)
      .set('X-CSRF-Token', headers(admin.cookie)['X-CSRF-Token'])
      .send({})
      .expect(403);
    await checkIn(event, confirmed)
      .set(headers(admin.cookie))
      .set('Origin', 'https://untrusted.example')
      .send({})
      .expect(403);
    await checkIn(event, confirmed)
      .set('Cookie', admin.cookie)
      .set('Origin', origin)
      .send({})
      .expect(403);
    await checkIn(event, confirmed)
      .set(headers(admin.cookie))
      .set('X-CSRF-Token', '0'.repeat(64))
      .send({})
      .expect(403);
    await client`UPDATE auth_sessions SET revoked_at = now() WHERE id = ${admin.sessionId}`;
    await checkIn(event, confirmed).set(headers(admin.cookie)).send({}).expect(401);
    expect(await rows()).toHaveLength(0);
  });

  it('serializes concurrent repeats into one fact that both requests return', async () => {
    const { event, confirmed } = await fixture();
    const { cookie } = await session('admin', event);
    const results = await Promise.all([
      checkIn(event, confirmed).set(headers(cookie)).send({}),
      checkIn(event, confirmed).set(headers(cookie)).send({}),
    ]);
    expect(results.map((result) => result.status)).toEqual([201, 201]);
    expect(
      results
        .map((result) => (result.body as { alreadyCheckedIn: boolean }).alreadyCheckedIn)
        .sort(),
    ).toEqual([false, true]);
    expect(results[0].body).toMatchObject({ id: (results[1].body as { id: string }).id });
    expect(await rows()).toHaveLength(1);
  });

  it('enforces scope, uniqueness, confirmed status and immutability in PostgreSQL too', async () => {
    const { event, other, confirmed, pending, voided, foreign } = await fixture();
    const { cookie, userId, sessionId } = await session('admin', event);
    const insert = (eventId: string, registrationId: string) => client`
      INSERT INTO event_check_ins (event_id, event_registration_id, actor_user_id, session_id)
      VALUES (${eventId}, ${registrationId}, ${userId}, ${sessionId})`;
    await expect(insert(other, confirmed)).rejects.toThrow();
    await expect(insert(event, pending)).rejects.toThrow();
    await expect(insert(event, voided)).rejects.toThrow();
    const [{ id: differentUser }] = await client<{ id: string }[]>`
      INSERT INTO users (email, display_name) VALUES ('different@example.com', 'Different') RETURNING id`;
    await expect(client`
      INSERT INTO event_check_ins (event_id, event_registration_id, actor_user_id, session_id)
      VALUES (${event}, ${confirmed}, ${differentUser}, ${sessionId})
    `).rejects.toThrow();
    await checkIn(event, confirmed).set(headers(cookie)).send({}).expect(201);
    await expect(insert(event, confirmed)).rejects.toThrow();
    await expect(client`UPDATE event_check_ins SET checked_in_at = now()`).rejects.toThrow();
    await expect(client`DELETE FROM event_check_ins`).rejects.toThrow();
    const start = new Date();
    const [direct] = await client<{ checked_in_at: string }[]>`
      INSERT INTO event_check_ins (event_id, event_registration_id, actor_user_id, session_id, checked_in_at)
      VALUES (${other}, ${foreign}, ${userId}, ${sessionId}, '2000-01-01')
      RETURNING checked_in_at`;
    expect(new Date(direct.checked_in_at).getTime()).toBeGreaterThanOrEqual(
      start.getTime() - 5_000,
    );
    expect(await rows()).toHaveLength(2);
  });
});
