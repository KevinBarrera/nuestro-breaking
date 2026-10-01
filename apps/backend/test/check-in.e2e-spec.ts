import { createHash, randomBytes } from 'node:crypto';
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
  const origin = process.env.AUTH_TRUSTED_ORIGIN ?? 'http://localhost:5173';
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
    await checkIn(event, confirmed).set(headers(cookie)).send({}).expect(409);
    expect(await rows()).toHaveLength(1);
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

  it('serializes concurrent repeats so only one succeeds and the other is explicitly denied', async () => {
    const { event, confirmed } = await fixture();
    const { cookie } = await session('admin', event);
    const results = await Promise.all([
      checkIn(event, confirmed).set(headers(cookie)).send({}),
      checkIn(event, confirmed).set(headers(cookie)).send({}),
    ]);
    expect(results.map((result) => result.status).sort()).toEqual([201, 409]);
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
