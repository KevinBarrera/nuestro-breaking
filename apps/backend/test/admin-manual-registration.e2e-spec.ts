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

describe('admin registration commands (e2e)', () => {
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
    const [{ id: org }] = await client<
      { id: string }[]
    >`INSERT INTO organizations (name) VALUES ('Org') RETURNING id`;
    const [event, other] = await client<{ id: string }[]>`
      INSERT INTO events (organization_id, name, time_zone)
      VALUES (${org}, 'One', 'Etc/UTC'), (${org}, 'Two', 'Etc/UTC') RETURNING id`;
    const [{ id: venue }] = await client<
      { id: string }[]
    >`INSERT INTO venues (organization_id, name) VALUES (${org}, 'Hall') RETURNING id`;
    await client`INSERT INTO event_venues (organization_id, event_id, venue_id) VALUES (${org}, ${event.id}, ${venue}), (${org}, ${other.id}, ${venue})`;
    const [activity, foreign] = await client<{ id: string }[]>`
      INSERT INTO activities (event_id, venue_id, kind, name, starts_at, ends_at)
      VALUES (${event.id}, ${venue}, 'battle', 'A', now(), now() + interval '1 hour'),
        (${other.id}, ${venue}, 'battle', 'B', now(), now() + interval '1 hour') RETURNING id`;
    return { event: event.id, other: other.id, activity: activity.id, foreign: foreign.id };
  }
  async function session(role: string, eventId: string) {
    const [{ id: userId }] = await client<
      { id: string }[]
    >`INSERT INTO users (email, display_name, active) VALUES (${randomBytes(8).toString('hex') + '@example.com'}, 'Operator', true) RETURNING id`;
    await client`INSERT INTO user_roles (user_id, role, scope_type, scope_id) VALUES (${userId}, ${role}, 'event', ${eventId})`;
    const token = randomBytes(32).toString('hex');
    const [{ id: sessionId }] = await client<
      { id: string }[]
    >`INSERT INTO auth_sessions (user_id, token_digest, expires_at) VALUES (${userId}, ${createHash('sha256').update(token).digest('hex')}, now() + interval '1 hour') RETURNING id`;
    return { cookie: `nb_admin_session=${token}`, userId, sessionId };
  }
  const trustedOrigin = process.env.AUTH_TRUSTED_ORIGIN ?? 'http://localhost:5173';
  const headers = (cookie: string) => ({
    Cookie: cookie,
    Origin: trustedOrigin,
    'X-CSRF-Token': createHash('sha256')
      .update(`nb-admin-csrf-v1:${cookie.slice('nb_admin_session='.length)}`)
      .digest('hex'),
  });
  const manual = (event: string) =>
    request(app.getHttpServer()).post(`/admin/events/${event}/registrations/manual`);
  const cash = (event: string, id: string) =>
    request(app.getHttpServer()).post(
      `/admin/events/${event}/registrations/${id}/cash-confirmation`,
    );
  async function counts() {
    const [row] = await client<{ participants: number; registrations: number; facts: number }[]>`
      SELECT (SELECT count(*)::int FROM participants) AS participants,
        (SELECT count(*)::int FROM event_registrations) AS registrations,
        (SELECT count(*)::int FROM registration_operation_audit) AS facts`;
    return row;
  }
  const data = { fullName: ' Alex Rivera ', phone: ' 555123 ', email: ' Alex@Example.com ' };

  it('requires active event-admin session for both operations, rejecting judges and wrong-event access', async () => {
    const { event, other } = await fixture();
    const admin = await session('admin', event);
    const judge = await session('judge', event);
    await manual(event).set('Origin', trustedOrigin).send(data).expect(401);
    await manual(event).set(headers(judge.cookie)).send(data).expect(401);
    await manual(other).set(headers(admin.cookie)).send(data).expect(401);
    await cash(event, other).set('Origin', trustedOrigin).send({ amount: 100 }).expect(401);
    await cash(event, other).set(headers(judge.cookie)).send({ amount: 100 }).expect(401);
    await cash(other, event).set(headers(admin.cookie)).send({ amount: 100 }).expect(401);
    await client`UPDATE auth_sessions SET revoked_at = now() WHERE id = ${admin.sessionId}`;
    await manual(event).set(headers(admin.cookie)).send(data).expect(401);
    await cash(event, other).set(headers(admin.cookie)).send({ amount: 100 }).expect(401);
    expect(await counts()).toEqual({ participants: 0, registrations: 0, facts: 0 });
  });

  it('rejects missing or untrusted Origin and missing or invalid session CSRF on both commands without writes', async () => {
    const { event } = await fixture();
    const { cookie } = await session('admin', event);
    const [{ id: participantId }] = await client<
      { id: string }[]
    >`INSERT INTO participants (full_name) VALUES ('Existing') RETURNING id`;
    const [{ id }] = await client<
      { id: string }[]
    >`INSERT INTO event_registrations (event_id, participant_id) VALUES (${event}, ${participantId}) RETURNING id`;
    const before = await counts();
    for (const makeRequest of [
      () => manual(event).send(data),
      () => cash(event, id).send({ amount: 100 }),
    ]) {
      await makeRequest()
        .set('Cookie', cookie)
        .set('X-CSRF-Token', headers(cookie)['X-CSRF-Token'])
        .expect(403);
      await makeRequest()
        .set(headers(cookie))
        .set('Origin', 'https://untrusted.example')
        .expect(403);
      await makeRequest().set('Cookie', cookie).set('Origin', trustedOrigin).expect(403);
      await makeRequest().set(headers(cookie)).set('X-CSRF-Token', '0'.repeat(64)).expect(403);
      expect(await counts()).toEqual(before);
      expect(
        (
          await client<
            { status: string }[]
          >`SELECT status FROM event_registrations WHERE id = ${id}`
        )[0].status,
      ).toBe('pending_payment');
    }
  });

  it('creates pending registration, same-event links and a safe attributed audit fact without mutating existing identity', async () => {
    const { event, activity } = await fixture();
    const { cookie, userId, sessionId } = await session('admin', event);
    const [{ id: existing }] = await client<
      { id: string }[]
    >`INSERT INTO participants (full_name, email) VALUES ('Shared', 'shared@example.com') RETURNING id`;
    const response = await manual(event)
      .set(headers(cookie))
      .send({ ...data, activityIds: [activity] })
      .expect(201);
    const { registrationId, participantId, auditId } = response.body as {
      registrationId: string;
      participantId: string;
      auditId: string;
    };
    expect(response.body).toMatchObject({ eventId: event, status: 'pending_payment' });
    const [row] = await client<
      {
        full_name: string;
        phone: string;
        email: string;
        status: string;
        confirmation_source: string | null;
        confirmed_at: Date | null;
      }[]
    >`
      SELECT p.full_name, p.phone, p.email, r.status, r.confirmation_source, r.confirmed_at
      FROM event_registrations r JOIN participants p ON p.id = r.participant_id WHERE r.id = ${registrationId} AND p.id = ${participantId}`;
    expect(row).toMatchObject({
      full_name: 'Alex Rivera',
      phone: '555123',
      email: 'alex@example.com',
      status: 'pending_payment',
      confirmation_source: null,
      confirmed_at: null,
    });
    const [fact] = await client<
      {
        operation_type: string;
        actor_kind: string;
        actor_user_id: string;
        session_id: string;
        affected_activity_ids: string[];
        before_state: unknown;
        after_state: { status: string };
      }[]
    >`
      SELECT operation_type, actor_kind, actor_user_id, session_id, affected_activity_ids, before_state, after_state FROM registration_operation_audit WHERE id = ${auditId} AND event_id = ${event} AND registration_id = ${registrationId} AND participant_id = ${participantId}`;
    expect(fact).toMatchObject({
      operation_type: 'manual_registration',
      actor_kind: 'admin',
      actor_user_id: userId,
      session_id: sessionId,
      affected_activity_ids: [activity],
      after_state: { status: 'pending_payment' },
    });
    expect(JSON.stringify(fact)).not.toMatch(/Alex|555123|example.com|nb_admin_session/);
    expect(
      await client`SELECT id FROM event_activity_registrations WHERE event_registration_id = ${registrationId} AND activity_id = ${activity}`,
    ).toHaveLength(1);
    expect(
      (await client`SELECT full_name FROM participants WHERE id = ${existing}`)[0].full_name,
    ).toBe('Shared');
  });

  it('rejects duplicate phone/email and foreign activities with no partial writes', async () => {
    const { event, foreign } = await fixture();
    const { cookie } = await session('admin', event);
    await manual(event).set(headers(cookie)).send(data).expect(201);
    for (const payload of [
      { fullName: 'Other', phone: ' 555123 ' },
      { fullName: 'Other', phone: '999', email: ' ALEX@example.COM ' },
      { fullName: 'Other', phone: '777', activityIds: [foreign] },
      { fullName: 'Other', phone: ' ' },
    ])
      await manual(event).set(headers(cookie)).send(payload).expect(400);
    expect(await counts()).toEqual({ participants: 1, registrations: 1, facts: 1 });
  });

  it('rolls back participant and registration when operation audit cannot be written', async () => {
    const { event } = await fixture();
    const { cookie } = await session('admin', event);
    await client`ALTER TABLE registration_operation_audit ADD CONSTRAINT reject_manual_test CHECK (operation_type <> 'manual_registration')`;
    await manual(event).set(headers(cookie)).send(data).expect(500);
    expect(await counts()).toEqual({ participants: 0, registrations: 0, facts: 0 });
  });

  it('confirms pending cash exactly once with amount and audit; rejects invalid transitions and wrong event', async () => {
    const { event, other } = await fixture();
    const { cookie } = await session('admin', event);
    const created = await manual(event)
      .set(headers(cookie))
      .send({ fullName: 'Cash', phone: '123' })
      .expect(201);
    const createdBody = created.body as { registrationId: string };
    const id = createdBody.registrationId;
    await cash(event, id).set(headers(cookie)).send({}).expect(400);
    await cash(event, id).set(headers(cookie)).send({ amount: 0 }).expect(400);
    await cash(other, id).set(headers(cookie)).send({ amount: 100 }).expect(401);
    const result = await cash(event, id)
      .set(headers(cookie))
      .send({ amount: 1250, reference: 'R-1', note: 'Paid', receipt: 'receipt-1' })
      .expect(201);
    const resultBody = result.body as {
      auditId: string;
      registrationId: string;
      status: string;
      folio: string;
    };
    expect(resultBody).toMatchObject({ registrationId: id, status: 'confirmed' });
    // The event's prefix (default `EV`) plus four characters of the look-alike-free alphabet.
    expect(resultBody.folio).toMatch(/^EV-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{4}$/);
    const [row] = await client<
      { status: string; confirmation_source: string; confirmed_at: Date; folio: string }[]
    >`SELECT status, confirmation_source, confirmed_at, folio FROM event_registrations WHERE id = ${id}`;
    expect(row).toMatchObject({
      status: 'confirmed',
      confirmation_source: 'admin_cash',
      folio: resultBody.folio,
    });
    expect(typeof row.confirmed_at).toBe('string');
    const [fact] = await client<
      {
        operation_type: string;
        amount_cents: number;
        reference: string;
        note: string;
        receipt: string;
        before_state: { status: string };
        after_state: { status: string; folio: string };
      }[]
    >`SELECT operation_type, amount_cents, reference, note, receipt, before_state, after_state FROM registration_operation_audit WHERE id = ${resultBody.auditId}`;
    expect(fact).toMatchObject({
      operation_type: 'cash_confirmation',
      amount_cents: 1250,
      reference: 'R-1',
      note: 'Paid',
      receipt: 'receipt-1',
      before_state: { status: 'pending_payment' },
      after_state: { status: 'confirmed', folio: resultBody.folio },
    });
    await cash(event, id).set(headers(cookie)).send({ amount: 100 }).expect(400);
    expect(await client`SELECT folio FROM event_registrations WHERE id = ${id}`).toEqual([
      { folio: resultBody.folio },
    ]);
    const [{ id: voided }] = await client<
      { id: string }[]
    >`INSERT INTO event_registrations (event_id, participant_id, status) VALUES (${event}, ${(await client<{ id: string }[]>`INSERT INTO participants (full_name) VALUES ('Void') RETURNING id`)[0].id}, 'voided') RETURNING id`;
    await cash(event, voided).set(headers(cookie)).send({ amount: 100 }).expect(400);
    const [{ id: foreign }] = await client<
      { id: string }[]
    >`INSERT INTO event_registrations (event_id, participant_id) VALUES (${other}, ${(await client<{ id: string }[]>`INSERT INTO participants (full_name) VALUES ('Foreign') RETURNING id`)[0].id}) RETURNING id`;
    await cash(event, foreign).set(headers(cookie)).send({ amount: 100 }).expect(400);
    expect(await client`SELECT id FROM registration_operation_audit`).toHaveLength(2);
    await client`ALTER TABLE registration_operation_audit ADD CONSTRAINT reject_cash_test CHECK (operation_type <> 'cash_confirmation') NOT VALID`;
    const [{ id: pending }] = await client<
      { id: string }[]
    >`INSERT INTO event_registrations (event_id, participant_id) VALUES (${event}, ${(await client<{ id: string }[]>`INSERT INTO participants (full_name) VALUES ('Pending') RETURNING id`)[0].id}) RETURNING id`;
    await cash(event, pending).set(headers(cookie)).send({ amount: 100 }).expect(500);
    expect(
      (
        await client<
          { status: string }[]
        >`SELECT status FROM event_registrations WHERE id = ${pending}`
      )[0].status,
    ).toBe('pending_payment');
    expect(await client`SELECT id FROM registration_operation_audit`).toHaveLength(2);
    await expect(
      client`UPDATE registration_operation_audit SET note = 'tampered' WHERE id = ${resultBody.auditId}`,
    ).rejects.toThrow();
  });
});
