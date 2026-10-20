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
import { readTrustedOrigin } from '@/http';
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
  const trustedOrigin = readTrustedOrigin(process.env);
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
  const complimentary = (event: string, id: string) =>
    request(app.getHttpServer()).post(
      `/admin/events/${event}/registrations/${id}/complimentary-confirmation`,
    );
  /** A pending registration of the event holding one pass per price snapshot, in cents. */
  async function pendingWithPasses(event: string, snapshots: number[]) {
    const [{ id }] = await client<{ id: string }[]>`
      WITH participant AS (INSERT INTO participants (full_name) VALUES ('Guest') RETURNING id)
      INSERT INTO event_registrations (event_id, participant_id)
      SELECT ${event}, id FROM participant RETURNING id`;
    for (const [index, priceCents] of snapshots.entries()) {
      // The pass type is free today; only the snapshot taken when the pass was held counts.
      const [{ id: passType }] = await client<{ id: string }[]>`
        INSERT INTO event_pass_types (event_id, name, pass_class, price_cents, requires_pass_class, status)
        VALUES (${event}, ${`Pass ${id}-${index}`}, ${index === 0 ? 'full' : 'add_on'}, 0,
          ${index === 0 ? null : 'full'}, 'active') RETURNING id`;
      await client`INSERT INTO event_registration_passes (event_id, event_registration_id, pass_type_id, price_cents)
        VALUES (${event}, ${id}, ${passType}, ${priceCents})`;
    }
    return id;
  }
  async function counts() {
    const [row] = await client<{ participants: number; registrations: number; facts: number }[]>`
      SELECT (SELECT count(*)::int FROM participants) AS participants,
        (SELECT count(*)::int FROM event_registrations) AS registrations,
        (SELECT count(*)::int FROM registration_operation_audit) AS facts`;
    return row;
  }
  const data = {
    firstName: ' Alex ',
    firstLastName: 'Rivera',
    phone: ' 55 1234 4567 ',
    email: ' Alex@Example.com ',
  };
  // A valid #58 body for another person, distinct by name, email and phone.
  const person = (n: number) => ({
    firstName: `Person${n}`,
    firstLastName: 'Test',
    email: `person${n}@example.com`,
    phone: `55000000${String(n).padStart(2, '0')}`,
  });
  type Match = {
    registrationId: string;
    fullName: string;
    stageName: string | null;
    folio: string | null;
    status: string;
    maskedEmail: string | null;
    maskedPhone: string | null;
  };
  type Conflict = { statusCode: number; code: string; message: string; matches: Match[] };

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
      phone: '55 1234 4567',
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
        facts: unknown;
      }[]
    >`
      SELECT operation_type, actor_kind, actor_user_id, session_id, affected_activity_ids, before_state, after_state, facts FROM registration_operation_audit WHERE id = ${auditId} AND event_id = ${event} AND registration_id = ${registrationId} AND participant_id = ${participantId}`;
    expect(fact).toMatchObject({
      operation_type: 'manual_registration',
      actor_kind: 'admin',
      actor_user_id: userId,
      session_id: sessionId,
      affected_activity_ids: [activity],
      after_state: { status: 'pending_payment' },
      facts: { participantCreated: true, possibleDuplicatesConfirmed: [] },
    });
    expect(JSON.stringify(fact)).not.toMatch(/Alex|Rivera|55 1234|example.com|nb_admin_session/);
    expect(
      await client`SELECT id FROM event_activity_registrations WHERE event_registration_id = ${registrationId} AND activity_id = ${activity}`,
    ).toHaveLength(1);
    expect(
      (await client`SELECT full_name FROM participants WHERE id = ${existing}`)[0].full_name,
    ).toBe('Shared');
  });

  it('requires the #58 fields, stores the optional ones and rejects foreign activities without writes', async () => {
    const { event, foreign } = await fixture();
    const { cookie } = await session('admin', event);
    const invalid = await manual(event)
      .set(headers(cookie))
      .send({ firstName: ' ', email: 'nope', phone: '123', fullName: 'Old shape' })
      .expect(400);
    expect(invalid.body).toEqual({
      statusCode: 400,
      message: 'Invalid manual registration',
      fieldErrors: {
        firstName: 'required',
        firstLastName: 'required',
        email: 'invalid',
        phone: 'invalid',
        fullName: 'unknown_field',
      },
    });
    for (const missing of ['firstName', 'firstLastName', 'email', 'phone']) {
      const body: Record<string, unknown> = { ...person(1) };
      delete body[missing];
      const response = await manual(event).set(headers(cookie)).send(body).expect(400);
      expect((response.body as { fieldErrors: unknown }).fieldErrors).toEqual({
        [missing]: 'required',
      });
    }
    await manual(event)
      .set(headers(cookie))
      .send({ ...person(1), activityIds: [foreign] })
      .expect(400);
    await manual(event)
      .set(headers(cookie))
      .send({ ...person(1), activityIds: 'nope' })
      .expect(400);
    expect(await counts()).toEqual({ participants: 0, registrations: 0, facts: 0 });

    const created = await manual(event)
      .set(headers(cookie))
      .send({
        ...person(1),
        secondLastName: ' García ',
        stageName: 'B-Boy One',
        city: 'CDMX',
        instagram: '@One.Breaks',
        level: 'Advanced',
        birthDate: '2001-02-03',
      })
      .expect(201);
    const [stored] = await client`
      SELECT full_name, first_name, first_last_name, second_last_name, stage_name, city, instagram,
        level, birth_date::text AS birth_date
      FROM participants WHERE id = ${(created.body as { participantId: string }).participantId}`;
    expect(stored).toEqual({
      full_name: 'Person1 Test García',
      first_name: 'Person1',
      first_last_name: 'Test',
      second_last_name: 'García',
      stage_name: 'B-Boy One',
      city: 'CDMX',
      instagram: 'one.breaks',
      level: 'Advanced',
      birth_date: '2001-02-03',
    });
  });

  it('answers same-event email or phone matches with masked possible duplicates and writes nothing', async () => {
    const { event, other } = await fixture();
    const { cookie } = await session('admin', event);
    const first = await manual(event)
      .set(headers(cookie))
      .send({ ...data, stageName: 'Flash' })
      .expect(201);
    const firstId = (first.body as { registrationId: string }).registrationId;
    const expected = {
      statusCode: 409,
      code: 'possible_duplicates',
      message: 'Possible duplicate registrations need confirmation',
      matches: [
        {
          registrationId: firstId,
          fullName: 'Alex Rivera',
          stageName: 'Flash',
          folio: null,
          status: 'pending_payment',
          maskedEmail: 'a***@example.com',
          maskedPhone: '******4567',
        },
      ],
    };
    // Email compared lowercased and trimmed; phone through the normalized match key.
    for (const payload of [
      { ...person(2), email: ' ALEX@example.COM ' },
      { ...person(3), phone: '+52 55 1234 4567' },
      { ...person(4), phone: '+521 (55) 1234-4567' },
    ]) {
      const response = await manual(event).set(headers(cookie)).send(payload).expect(409);
      expect(response.body).toEqual(expected);
    }
    expect(await counts()).toEqual({ participants: 1, registrations: 1, facts: 1 });
    // Another event's registrations never count.
    await manual(other)
      .set(headers((await session('admin', other)).cookie))
      .send({ ...person(5), email: 'alex@example.com' })
      .expect(201);
  });

  it('ignores voided and expired registrations of the event when looking for duplicates', async () => {
    const { event } = await fixture();
    const { cookie } = await session('admin', event);
    const [voidedPerson, expiredPerson] = await client<{ id: string }[]>`
      INSERT INTO participants (full_name, email, phone)
      VALUES ('Voided', 'person1@example.com', '000'), ('Expired', 'x@example.com', '55 0000 0002')
      RETURNING id`;
    await client`INSERT INTO event_registrations (event_id, participant_id, status) VALUES (${event}, ${voidedPerson.id}, 'voided')`;
    const [{ id: expired }] = await client<{ id: string }[]>`
      INSERT INTO event_registrations (event_id, participant_id, expires_at)
      VALUES (${event}, ${expiredPerson.id}, now() - interval '1 minute') RETURNING id`;
    await manual(event).set(headers(cookie)).send(person(1)).expect(201);
    await manual(event).set(headers(cookie)).send(person(2)).expect(201);
    // The expired online registration is voided first, as public registration does.
    expect(await client`SELECT status FROM event_registrations WHERE id = ${expired}`).toEqual([
      { status: 'voided' },
    ]);
  });

  it('creates the registration once every current match is confirmed and records the confirmed ids', async () => {
    const { event } = await fixture();
    const { cookie, userId, sessionId } = await session('admin', event);
    const first = await manual(event).set(headers(cookie)).send(data).expect(201);
    const firstId = (first.body as { registrationId: string }).registrationId;
    const duplicate = { ...person(2), email: 'alex@example.com' };
    const preview = await manual(event).set(headers(cookie)).send(duplicate).expect(409);
    expect((preview.body as Conflict).matches.map((m) => m.registrationId)).toEqual([firstId]);

    // A match that appears between the preview and the confirmation is detected on write.
    const [{ id: lateParticipant }] = await client<{ id: string }[]>`
      INSERT INTO participants (full_name, phone) VALUES ('Late', '55 0000 0002') RETURNING id`;
    const [{ id: lateId }] = await client<{ id: string }[]>`
      INSERT INTO event_registrations (event_id, participant_id) VALUES (${event}, ${lateParticipant}) RETURNING id`;
    const again = await manual(event)
      .set(headers(cookie))
      .send({ ...duplicate, confirmedDuplicateRegistrationIds: [firstId] })
      .expect(409);
    expect((again.body as Conflict).matches.map((m) => m.registrationId).sort()).toEqual(
      [firstId, lateId].sort(),
    );
    expect(await counts()).toEqual({ participants: 2, registrations: 2, facts: 1 });

    for (const confirmedDuplicateRegistrationIds of [['nope'], firstId, [firstId, firstId]])
      await manual(event)
        .set(headers(cookie))
        .send({ ...duplicate, confirmedDuplicateRegistrationIds })
        .expect(400);

    const created = await manual(event)
      .set(headers(cookie))
      .send({ ...duplicate, confirmedDuplicateRegistrationIds: [lateId.toUpperCase(), firstId] })
      .expect(201);
    const { auditId } = created.body as { auditId: string };
    const [fact] = await client<
      { actor_user_id: string; session_id: string; created_at: Date; facts: unknown }[]
    >`SELECT actor_user_id, session_id, created_at, facts FROM registration_operation_audit WHERE id = ${auditId}`;
    expect(fact).toMatchObject({ actor_user_id: userId, session_id: sessionId });
    expect(fact.created_at).toBeTruthy();
    expect(fact.facts).toEqual({
      participantCreated: true,
      possibleDuplicatesConfirmed: [firstId, lateId].sort(),
    });
    expect(JSON.stringify(fact)).not.toMatch(/Alex|Person2|example.com|55 0000/);
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
    const created = await manual(event).set(headers(cookie)).send(person(1)).expect(201);
    const createdBody = created.body as { registrationId: string };
    const id = createdBody.registrationId;
    await cash(event, id).set(headers(cookie)).send({}).expect(400);
    await cash(event, id).set(headers(cookie)).send({ amount: 0, receipt: 'R-0' }).expect(400);
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
    await cash(event, id).set(headers(cookie)).send({ amount: 100, receipt: 'R-2' }).expect(400);
    expect(await client`SELECT folio FROM event_registrations WHERE id = ${id}`).toEqual([
      { folio: resultBody.folio },
    ]);
    const [{ id: voided }] = await client<
      { id: string }[]
    >`INSERT INTO event_registrations (event_id, participant_id, status) VALUES (${event}, ${(await client<{ id: string }[]>`INSERT INTO participants (full_name) VALUES ('Void') RETURNING id`)[0].id}, 'voided') RETURNING id`;
    await cash(event, voided)
      .set(headers(cookie))
      .send({ amount: 100, receipt: 'R-3' })
      .expect(400);
    const [{ id: foreign }] = await client<
      { id: string }[]
    >`INSERT INTO event_registrations (event_id, participant_id) VALUES (${other}, ${(await client<{ id: string }[]>`INSERT INTO participants (full_name) VALUES ('Foreign') RETURNING id`)[0].id}) RETURNING id`;
    await cash(event, foreign)
      .set(headers(cookie))
      .send({ amount: 100, receipt: 'R-4' })
      .expect(400);
    expect(await client`SELECT id FROM registration_operation_audit`).toHaveLength(2);
    await client`ALTER TABLE registration_operation_audit ADD CONSTRAINT reject_cash_test CHECK (operation_type <> 'cash_confirmation') NOT VALID`;
    const [{ id: pending }] = await client<
      { id: string }[]
    >`INSERT INTO event_registrations (event_id, participant_id) VALUES (${event}, ${(await client<{ id: string }[]>`INSERT INTO participants (full_name) VALUES ('Pending') RETURNING id`)[0].id}) RETURNING id`;
    await cash(event, pending)
      .set(headers(cookie))
      .send({ amount: 100, receipt: 'R-5' })
      .expect(500);
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

  it('requires a receipt of 1 to 50 characters, unique within the event, for cash confirmation', async () => {
    const { event, other } = await fixture();
    const { cookie } = await session('admin', event);
    const otherCookie = (await session('admin', other)).cookie;
    const register = async (eventId: string, n: number, sessionCookie = cookie) =>
      (
        (await manual(eventId).set(headers(sessionCookie)).send(person(n)).expect(201)).body as {
          registrationId: string;
        }
      ).registrationId;
    const [one, two, three, four] = [
      await register(event, 1),
      await register(event, 2),
      await register(event, 3),
      await register(event, 4),
    ];
    for (const receipt of [undefined, null, '', '   ', 7, 'x'.repeat(51)]) {
      const response = await cash(event, one)
        .set(headers(cookie))
        .send({ amount: 100, receipt })
        .expect(400);
      expect((response.body as { message: string }).message).toBe(
        'Receipt number is required and must be 1 to 50 characters',
      );
    }
    expect(await counts()).toEqual({ participants: 4, registrations: 4, facts: 4 });

    await cash(event, one)
      .set(headers(cookie))
      .send({ amount: 100, receipt: ` ${'9'.repeat(50)} ` })
      .expect(201);
    await cash(event, two)
      .set(headers(cookie))
      .send({ amount: 100, receipt: ' A-17 ' })
      .expect(201);
    expect(
      await client`SELECT receipt FROM registration_operation_audit WHERE operation_type = 'cash_confirmation' ORDER BY receipt`,
    ).toEqual([{ receipt: '9'.repeat(50) }, { receipt: 'A-17' }]);

    // Compared exactly after trimming: the same number again is rejected, another case is not.
    const taken = await cash(event, three)
      .set(headers(cookie))
      .send({ amount: 100, receipt: 'A-17' })
      .expect(409);
    expect(taken.body).toEqual({
      statusCode: 409,
      code: 'receipt_taken',
      message: 'Receipt number already used in this event',
    });
    expect(await client`SELECT status, folio FROM event_registrations WHERE id = ${three}`).toEqual(
      [{ status: 'pending_payment', folio: null }],
    );
    expect(await counts()).toEqual({ participants: 4, registrations: 4, facts: 6 });
    await cash(event, three)
      .set(headers(cookie))
      .send({ amount: 100, receipt: 'a-17' })
      .expect(201);

    // Another event may reuse the number.
    const foreign = await register(other, 5, otherCookie);
    await cash(other, foreign)
      .set(headers(otherCookie))
      .send({ amount: 100, receipt: 'A-17' })
      .expect(201);

    // Concurrent confirmations with one number: exactly one succeeds.
    const five = await register(event, 6);
    const statuses = (
      await Promise.all(
        [four, five].map((id) =>
          cash(event, id).set(headers(cookie)).send({ amount: 100, receipt: 'SAME' }),
        ),
      )
    )
      .map((response) => response.status)
      .sort();
    expect(statuses).toEqual([201, 409]);
    expect(
      await client`SELECT count(*)::int AS n FROM registration_operation_audit WHERE receipt = 'SAME'`,
    ).toEqual([{ n: 1 }]);
  });

  it('keeps earlier cash confirmations without a receipt as legacy rows', async () => {
    const { event } = await fixture();
    const { userId, sessionId } = await session('admin', event);
    const legacy = await client<{ id: string }[]>`
      INSERT INTO participants (full_name) VALUES ('Legacy one'), ('Legacy two') RETURNING id`;
    for (const { id: participantId } of legacy) {
      const [{ id }] = await client<{ id: string }[]>`
        INSERT INTO event_registrations (event_id, participant_id)
        VALUES (${event}, ${participantId}) RETURNING id`;
      await client`
        INSERT INTO registration_operation_audit (operation_type, actor_kind, actor_user_id, session_id,
          event_id, registration_id, participant_id, amount_cents, before_state, after_state)
        VALUES ('cash_confirmation', 'admin', ${userId}, ${sessionId}, ${event}, ${id},
          ${participantId}, 100, '{}', '{}')`;
    }
    expect(
      await client`SELECT count(*)::int AS n FROM registration_operation_audit WHERE receipt IS NULL`,
    ).toEqual([{ n: 2 }]);
  });

  it('requires an active event-admin session and session CSRF for complimentary confirmation', async () => {
    const { event, other } = await fixture();
    const admin = await session('admin', event);
    const judge = await session('judge', event);
    const id = await pendingWithPasses(event, [0]);
    const body = { reason: 'Golden ticket' };
    await complimentary(event, id).set('Origin', trustedOrigin).send(body).expect(401);
    await complimentary(event, id).set(headers(judge.cookie)).send(body).expect(401);
    await complimentary(other, id).set(headers(admin.cookie)).send(body).expect(401);
    await complimentary(event, id)
      .set('Cookie', admin.cookie)
      .set('X-CSRF-Token', headers(admin.cookie)['X-CSRF-Token'])
      .send(body)
      .expect(403);
    await complimentary(event, id)
      .set(headers(admin.cookie))
      .set('Origin', 'https://untrusted.example')
      .send(body)
      .expect(403);
    await complimentary(event, id)
      .set('Cookie', admin.cookie)
      .set('Origin', trustedOrigin)
      .send(body)
      .expect(403);
    await complimentary(event, id)
      .set(headers(admin.cookie))
      .set('X-CSRF-Token', '0'.repeat(64))
      .send(body)
      .expect(403);
    expect(await client`SELECT status FROM event_registrations WHERE id = ${id}`).toEqual([
      { status: 'pending_payment' },
    ]);
    expect(await counts()).toMatchObject({ facts: 0 });
  });

  it('confirms a $0 registration without payment, with the reason in an attributed audit fact (#263)', async () => {
    const { event } = await fixture();
    const { cookie, userId, sessionId } = await session('admin', event);
    const id = await pendingWithPasses(event, [0, 0]);
    const result = await complimentary(event, id)
      .set(headers(cookie))
      .send({ reason: '  Golden ticket, winner of the cypher  ' })
      .expect(201);
    const body = result.body as { auditId: string; folio: string };
    expect(body).toEqual({
      registrationId: id,
      eventId: event,
      status: 'confirmed',
      folio: expect.stringMatching(/^EV-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{4}$/) as string,
      auditId: expect.any(String) as string,
    });
    expect(
      await client`SELECT status, confirmation_source, folio FROM event_registrations WHERE id = ${id}`,
    ).toEqual([
      { status: 'confirmed', confirmation_source: 'admin_complimentary', folio: body.folio },
    ]);
    const facts = await client`
      SELECT id, operation_type, actor_kind, actor_user_id, session_id, amount_cents, reference,
        note, receipt, before_state, after_state
      FROM registration_operation_audit`;
    expect(facts).toEqual([
      {
        id: body.auditId,
        operation_type: 'complimentary_confirmation',
        actor_kind: 'admin',
        actor_user_id: userId,
        session_id: sessionId,
        amount_cents: null,
        reference: null,
        note: 'Golden ticket, winner of the cypher',
        receipt: null,
        before_state: {
          status: 'pending_payment',
          confirmationSource: null,
          confirmedAt: null,
          folio: null,
        },
        after_state: {
          status: 'confirmed',
          confirmationSource: 'admin_complimentary',
          confirmedAt: expect.any(String) as string,
          folio: body.folio,
        },
      },
    ]);
    expect(await client`SELECT registration_id FROM registration_confirmation_emails`).toEqual([
      { registration_id: id },
    ]);
  });

  it('requires a reason of 1 to 500 characters for complimentary confirmation', async () => {
    const { event } = await fixture();
    const { cookie } = await session('admin', event);
    const id = await pendingWithPasses(event, [0]);
    for (const body of [
      {},
      { reason: null },
      { reason: '' },
      { reason: '   ' },
      { reason: 7 },
      { reason: 'x'.repeat(501) },
    ]) {
      const response = await complimentary(event, id).set(headers(cookie)).send(body).expect(400);
      expect((response.body as { message: string }).message).toBe(
        'Reason is required and must be 1 to 500 characters',
      );
    }
    expect(await counts()).toMatchObject({ facts: 0 });
    await complimentary(event, id)
      .set(headers(cookie))
      .send({ reason: ` ${'r'.repeat(500)} ` })
      .expect(201);
  });

  it('rejects complimentary confirmation of a registration without passes or with a paid snapshot, writing nothing', async () => {
    const { event } = await fixture();
    const { cookie } = await session('admin', event);
    const paid = await pendingWithPasses(event, [0, 30000]);
    const empty = await pendingWithPasses(event, []);
    const notZero = await complimentary(event, paid)
      .set(headers(cookie))
      .send({ reason: 'Guest' })
      .expect(409);
    expect(notZero.body).toEqual({
      statusCode: 409,
      code: 'not_zero_total',
      message: 'Registration passes do not total zero',
    });
    const noPasses = await complimentary(event, empty)
      .set(headers(cookie))
      .send({ reason: 'Guest' })
      .expect(409);
    expect(noPasses.body).toEqual({
      statusCode: 409,
      code: 'no_passes',
      message: 'Registration holds no passes',
    });
    expect(
      await client`SELECT status, confirmation_source, folio FROM event_registrations ORDER BY status`,
    ).toEqual([
      { status: 'pending_payment', confirmation_source: null, folio: null },
      { status: 'pending_payment', confirmation_source: null, folio: null },
    ]);
    expect(await counts()).toMatchObject({ facts: 0 });
    expect(await client`SELECT id FROM registration_confirmation_emails`).toEqual([]);
  });

  it('rejects complimentary confirmation of a registration that is not pending in the event', async () => {
    const { event, other } = await fixture();
    const { cookie } = await session('admin', event);
    const confirmed = await pendingWithPasses(event, [0]);
    await complimentary(event, confirmed)
      .set(headers(cookie))
      .send({ reason: 'Guest' })
      .expect(201);
    const voided = await pendingWithPasses(event, [0]);
    await client`UPDATE event_registrations SET status = 'voided' WHERE id = ${voided}`;
    const foreign = await pendingWithPasses(other, [0]);
    for (const id of [confirmed, voided, foreign]) {
      const response = await complimentary(event, id)
        .set(headers(cookie))
        .send({ reason: 'Guest' })
        .expect(400);
      expect((response.body as { message: string }).message).toBe(
        'Registration is not pending in this event',
      );
    }
    expect(await counts()).toMatchObject({ facts: 1 });
  });
});
