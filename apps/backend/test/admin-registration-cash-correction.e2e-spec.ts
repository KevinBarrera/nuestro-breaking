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

type Entitlements = {
  registration: {
    id: string;
    status: string;
    cash: { amountCents: number; receipt: string | null } | null;
  };
  passes: { registrationPassId: string }[];
  accessibleActivityIds: string[];
};

// Cash correction (#104): an admin corrects the amount and/or receipt of a confirmed cash payment
// after checking the paper receipt, with a mandatory reason; the audit keeps the previous values.
describe('admin registration cash correction (e2e)', () => {
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
    const [{ id: general }] = await client<{ id: string }[]>`
      INSERT INTO event_pass_types (event_id, name, pass_class, price_cents)
      VALUES (${event.id}, 'General', 'general', 50000) RETURNING id`;
    return { event: event.id, other: other.id, general };
  }
  async function registration(
    eventId: string,
    options: { status?: string; source?: string; online?: boolean } = {},
  ) {
    const status = options.status ?? 'pending_payment';
    const [{ id: participantId }] = await client<{ id: string }[]>`
      INSERT INTO participants (full_name, email) VALUES ('Dancer', 'dancer@example.com') RETURNING id`;
    const confirmed = status === 'confirmed';
    const source = confirmed ? (options.source ?? 'admin_cash') : null;
    const expiresAt = options.online ? new Date(Date.now() + 3_600_000).toISOString() : null;
    const [{ id }] = await client<{ id: string }[]>`
      INSERT INTO event_registrations (event_id, participant_id, status, confirmation_source, confirmed_at, expires_at)
      VALUES (${eventId}, ${participantId}, ${status}, ${source}, ${confirmed ? new Date().toISOString() : null}, ${expiresAt})
      RETURNING id`;
    return { id, participantId };
  }
  // A confirmed cash registration with its current payment row, as task 1 stores it.
  async function cashRegistration(eventId: string, amountCents: number, receipt: string | null) {
    const reg = await registration(eventId, { status: 'confirmed' });
    await client`INSERT INTO event_cash_payments (event_id, event_registration_id, amount_cents, receipt, created_at, updated_at)
      VALUES (${eventId}, ${reg.id}, ${amountCents}, ${receipt}, '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z')`;
    return reg;
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
  const server = () => request(app.getHttpServer());
  const correct = (event: string, registrationId: string) =>
    server().post(`/admin/events/${event}/registrations/${registrationId}/cash-correction`);
  const read = (event: string, registrationId: string) =>
    server().get(`/admin/events/${event}/registrations/${registrationId}/entitlements`);
  const valid = {
    amountCents: 60000,
    receipt: 'R-2',
    reason: 'Wrong amount',
    receiptChecked: true,
  };
  async function audits(type = 'cash_correction') {
    return client`SELECT operation_type, actor_kind, actor_user_id, session_id, event_id,
        registration_id, participant_id, affected_activity_ids, amount_cents, reference, receipt,
        note, before_state, after_state, facts
      FROM registration_operation_audit WHERE operation_type = ${type} ORDER BY created_at, id`;
  }
  async function payments() {
    return client`SELECT event_id, event_registration_id, amount_cents, receipt, updated_at
      FROM event_cash_payments ORDER BY event_registration_id`;
  }
  async function snapshot() {
    const registrations =
      await client`SELECT id, status, confirmation_source, confirmed_at, folio, updated_at FROM event_registrations ORDER BY id`;
    return { payments: await payments(), registrations };
  }

  it('corrects the amount only, keeping the receipt, and audits the previous values (#104)', async () => {
    const f = await fixture();
    const { cookie, userId, sessionId } = await session('admin', f.event);
    const reg = await cashRegistration(f.event, 50000, 'R-1');
    const response = await correct(f.event, reg.id)
      .set(headers(cookie))
      .send({
        amountCents: 45000,
        receipt: '  R-1 ',
        reason: '  Typed 500 for 450  ',
        receiptChecked: true,
      })
      .expect(200);
    const body = response.body as Entitlements;
    expect(body.registration).toMatchObject({
      id: reg.id,
      status: 'confirmed',
      cash: { amountCents: 45000, receipt: 'R-1' },
    });
    const [payment] = await payments();
    expect(payment).toMatchObject({ amount_cents: 45000, receipt: 'R-1' });
    expect(new Date(payment.updated_at as string).getTime()).toBeGreaterThan(
      new Date('2026-01-01T00:00:00Z').getTime(),
    );
    expect(await audits()).toEqual([
      {
        operation_type: 'cash_correction',
        actor_kind: 'admin',
        actor_user_id: userId,
        session_id: sessionId,
        event_id: f.event,
        registration_id: reg.id,
        participant_id: reg.participantId,
        affected_activity_ids: [],
        amount_cents: null,
        reference: null,
        receipt: null,
        note: 'Typed 500 for 450',
        before_state: { status: 'confirmed', amountCents: 50000, receipt: 'R-1' },
        after_state: { status: 'confirmed', amountCents: 45000, receipt: 'R-1' },
        facts: { changedFields: ['amountCents'], receiptChecked: true },
      },
    ]);
  });

  it('corrects the receipt only and both values at once (#104)', async () => {
    const f = await fixture();
    const { cookie } = await session('admin', f.event);
    const reg = await cashRegistration(f.event, 50000, 'R-1');
    await correct(f.event, reg.id)
      .set(headers(cookie))
      .send({ amountCents: 50000, receipt: 'R-10', reason: 'Wrong receipt', receiptChecked: true })
      .expect(200);
    const both = await correct(f.event, reg.id)
      .set(headers(cookie))
      .send({ amountCents: 40000, receipt: 'R-11', reason: 'Both wrong', receiptChecked: true })
      .expect(200);
    expect((both.body as Entitlements).registration.cash).toEqual({
      amountCents: 40000,
      receipt: 'R-11',
    });
    const facts = await audits();
    expect(
      facts.map((fact): unknown[] => [fact.before_state, fact.after_state, fact.facts]),
    ).toEqual([
      [
        { status: 'confirmed', amountCents: 50000, receipt: 'R-1' },
        { status: 'confirmed', amountCents: 50000, receipt: 'R-10' },
        { changedFields: ['receipt'], receiptChecked: true },
      ],
      [
        { status: 'confirmed', amountCents: 50000, receipt: 'R-10' },
        { status: 'confirmed', amountCents: 40000, receipt: 'R-11' },
        { changedFields: ['amountCents', 'receipt'], receiptChecked: true },
      ],
    ]);
    // The released receipt can be used by another registration of the event.
    const next = await cashRegistration(f.event, 50000, 'R-2');
    await correct(f.event, next.id)
      .set(headers(cookie))
      .send({ amountCents: 50000, receipt: 'R-1', reason: 'Reuse', receiptChecked: true })
      .expect(200);
  });

  it('gives a legacy confirmation without a receipt one, auditing the null receipt (#104)', async () => {
    const f = await fixture();
    const { cookie } = await session('admin', f.event);
    const reg = await cashRegistration(f.event, 50000, null);
    const before = await read(f.event, reg.id).set(headers(cookie)).expect(200);
    expect((before.body as Entitlements).registration.cash).toEqual({
      amountCents: 50000,
      receipt: null,
    });
    await correct(f.event, reg.id)
      .set(headers(cookie))
      .send({ amountCents: 50000, receipt: 'L-1', reason: 'Add receipt', receiptChecked: true })
      .expect(200);
    const [fact] = await audits();
    expect(fact.before_state).toEqual({ status: 'confirmed', amountCents: 50000, receipt: null });
    expect(fact.after_state).toEqual({ status: 'confirmed', amountCents: 50000, receipt: 'L-1' });
    expect(fact.facts).toEqual({ changedFields: ['receipt'], receiptChecked: true });
  });

  it('corrects a payment confirmed through the cash confirmation route, keeping its own receipt (#104)', async () => {
    const f = await fixture();
    const { cookie } = await session('admin', f.event);
    const reg = await registration(f.event);
    await client`INSERT INTO event_registration_passes (event_id, event_registration_id, pass_type_id, price_cents)
      VALUES (${f.event}, ${reg.id}, ${f.general}, 50000)`;
    await server()
      .post(`/admin/events/${f.event}/registrations/${reg.id}/cash-confirmation`)
      .set(headers(cookie))
      .send({ amount: 5000, receipt: 'A-17' })
      .expect(201);
    const response = await correct(f.event, reg.id)
      .set(headers(cookie))
      .send({ amountCents: 50000, receipt: 'A-17', reason: 'Missing a zero', receiptChecked: true })
      .expect(200);
    expect((response.body as Entitlements).registration.cash).toEqual({
      amountCents: 50000,
      receipt: 'A-17',
    });
    // The original confirmation fact keeps the values as confirmed.
    const [confirmation] = await audits('cash_confirmation');
    expect(confirmation).toMatchObject({ amount_cents: 5000, receipt: 'A-17' });
    const [fact] = await audits();
    expect(fact.facts).toEqual({ changedFields: ['amountCents'], receiptChecked: true });
  });

  it('exposes the current cash payment in the summary only for cash registrations (#104)', async () => {
    const f = await fixture();
    const { cookie } = await session('admin', f.event);
    const cash = await cashRegistration(f.event, 50000, 'R-1');
    const online = await registration(f.event, {
      status: 'confirmed',
      source: 'approved_payment',
      online: true,
    });
    const complimentary = await registration(f.event, {
      status: 'confirmed',
      source: 'admin_complimentary',
    });
    const pending = await registration(f.event);
    const cashOf = async (id: string) =>
      ((await read(f.event, id).set(headers(cookie)).expect(200)).body as Entitlements).registration
        .cash;
    expect(await cashOf(cash.id)).toEqual({ amountCents: 50000, receipt: 'R-1' });
    expect(await cashOf(online.id)).toBeNull();
    expect(await cashOf(complimentary.id)).toBeNull();
    expect(await cashOf(pending.id)).toBeNull();
    // Other entitlement routes return the same summary.
    const voided = await server()
      .post(`/admin/events/${f.event}/registrations/${cash.id}/participant-correction`)
      .set(headers(cookie))
      .send({ firstName: 'Dan', firstLastName: 'Cer', reason: 'Typo' })
      .expect(200);
    expect((voided.body as Entitlements).registration.cash).toEqual({
      amountCents: 50000,
      receipt: 'R-1',
    });
  });

  it('rejects malformed bodies with field errors before anything else (#104)', async () => {
    const f = await fixture();
    const { cookie } = await session('admin', f.event);
    const reg = await cashRegistration(f.event, 50000, 'R-1');
    const cases: [Record<string, unknown>, Record<string, string>][] = [
      [{}, { amountCents: 'required', receipt: 'required', receiptChecked: 'required' }],
      [
        { ...valid, amountCents: null, receipt: null, receiptChecked: null },
        {
          amountCents: 'required',
          receipt: 'required',
          receiptChecked: 'required',
        },
      ],
      [{ ...valid, amountCents: 0 }, { amountCents: 'invalid' }],
      [{ ...valid, amountCents: -5 }, { amountCents: 'invalid' }],
      [{ ...valid, amountCents: 10.5 }, { amountCents: 'invalid' }],
      [{ ...valid, amountCents: '60000' }, { amountCents: 'invalid' }],
      [{ ...valid, amountCents: 2147483648 }, { amountCents: 'invalid' }],
      [{ ...valid, receipt: '   ' }, { receipt: 'required' }],
      [{ ...valid, receipt: 17 }, { receipt: 'invalid' }],
      [{ ...valid, receipt: 'R'.repeat(51) }, { receipt: 'too_long' }],
      [{ ...valid, receiptChecked: 'true' }, { receiptChecked: 'invalid' }],
      [
        { ...valid, note: 'x', reference: 'y' },
        { note: 'unknown_field', reference: 'unknown_field' },
      ],
    ];
    for (const [body, fieldErrors] of cases) {
      // A missing registration still gets the field errors: they come first.
      const response = await correct(f.event, '00000000-0000-4000-8000-000000000000')
        .set(headers(cookie))
        .send(body)
        .expect(400);
      expect(response.body).toEqual({
        statusCode: 400,
        message: 'Invalid cash correction',
        fieldErrors,
      });
    }
    await correct(f.event, reg.id).set(headers(cookie)).send([]).expect(400);
    // The bounds themselves are accepted.
    await correct(f.event, reg.id)
      .set(headers(cookie))
      .send({ ...valid, amountCents: 2147483647, receipt: 'R'.repeat(50) })
      .expect(200);
    expect((await payments())[0]).toMatchObject({ amount_cents: 2147483647 });
    expect(await audits()).toHaveLength(1);
  });

  it('rejects missing or other-event registrations, a missing reason and an unchecked receipt in that order (#104)', async () => {
    const f = await fixture();
    const { cookie } = await session('admin', f.event);
    const reg = await cashRegistration(f.event, 50000, 'R-1');
    const foreign = await cashRegistration(f.other, 50000, 'R-9');
    const before = await snapshot();
    await correct(f.event, '00000000-0000-4000-8000-000000000000')
      .set(headers(cookie))
      .send(valid)
      .expect(404);
    await correct(f.event, foreign.id).set(headers(cookie)).send(valid).expect(404);
    await correct(f.event, foreign.id)
      .set(headers(cookie))
      .send({ ...valid, reason: '', receiptChecked: false })
      .expect(404);
    for (const reason of [undefined, null, '', '   ', 42, 'x'.repeat(501)]) {
      const response = await correct(f.event, reg.id)
        .set(headers(cookie))
        .send({ ...valid, reason, receiptChecked: false })
        .expect(400);
      expect(response.body).toMatchObject({ code: 'correction_reason_required' });
    }
    const unchecked = await correct(f.event, reg.id)
      .set(headers(cookie))
      .send({ ...valid, receiptChecked: false })
      .expect(400);
    expect(unchecked.body).toMatchObject({ code: 'cash_receipt_check_required' });
    expect(await snapshot()).toEqual(before);
    expect(await audits()).toHaveLength(0);
  });

  it('rejects voided, non-cash and unchanged registrations (#104)', async () => {
    const f = await fixture();
    const { cookie } = await session('admin', f.event);
    const reg = await cashRegistration(f.event, 50000, 'R-1');
    const voided = await registration(f.event, { status: 'voided' });
    const online = await registration(f.event, {
      status: 'confirmed',
      source: 'approved_payment',
      online: true,
    });
    const complimentary = await registration(f.event, {
      status: 'confirmed',
      source: 'admin_complimentary',
    });
    const pending = await registration(f.event);
    const before = await snapshot();
    const voidedResponse = await correct(f.event, voided.id)
      .set(headers(cookie))
      .send(valid)
      .expect(409);
    expect(voidedResponse.body).toMatchObject({ code: 'registration_voided' });
    for (const id of [online.id, complimentary.id, pending.id]) {
      const response = await correct(f.event, id).set(headers(cookie)).send(valid).expect(409);
      expect(response.body).toMatchObject({ code: 'cash_correction_not_cash' });
    }
    const unchanged = await correct(f.event, reg.id)
      .set(headers(cookie))
      .send({ ...valid, amountCents: 50000, receipt: ' R-1 ' })
      .expect(400);
    expect(unchanged.body).toMatchObject({ code: 'correction_no_changes' });
    expect(await snapshot()).toEqual(before);
    expect(await audits()).toHaveLength(0);
  });

  it('rejects a receipt held by another registration of the event, exactly compared (#104)', async () => {
    const f = await fixture();
    const { cookie } = await session('admin', f.event);
    const reg = await cashRegistration(f.event, 50000, 'R-1');
    await cashRegistration(f.event, 50000, 'R-2');
    await cashRegistration(f.other, 50000, 'R-3');
    const before = await snapshot();
    const taken = await correct(f.event, reg.id)
      .set(headers(cookie))
      .send({ ...valid, receipt: 'R-2' })
      .expect(409);
    expect(taken.body).toEqual({
      statusCode: 409,
      message: 'Receipt number already used in this event',
      code: 'receipt_taken',
    });
    expect(await snapshot()).toEqual(before);
    expect(await audits()).toHaveLength(0);
    // Another event's receipt and a different case are free.
    await correct(f.event, reg.id)
      .set(headers(cookie))
      .send({ ...valid, receipt: 'R-3' })
      .expect(200);
    await correct(f.event, reg.id)
      .set(headers(cookie))
      .send({ ...valid, receipt: 'r-2' })
      .expect(200);
  });

  it('rejects corrections from judges, unauthenticated callers, other-event admins and missing CSRF or origin (#104)', async () => {
    const f = await fixture();
    const admin = await session('admin', f.event);
    const judge = await session('judge', f.event);
    const otherAdmin = await session('admin', f.other);
    const reg = await cashRegistration(f.event, 50000, 'R-1');
    const before = await snapshot();
    const command = () => correct(f.event, reg.id).send(valid);
    await command().set('Origin', trustedOrigin).expect(401);
    await command().set(headers(judge.cookie)).expect(401);
    await command().set(headers(otherAdmin.cookie)).expect(401);
    await command()
      .set('Cookie', admin.cookie)
      .set('X-CSRF-Token', headers(admin.cookie)['X-CSRF-Token'])
      .expect(403);
    await command()
      .set(headers(admin.cookie))
      .set('Origin', 'https://untrusted.example')
      .expect(403);
    await command().set('Cookie', admin.cookie).set('Origin', trustedOrigin).expect(403);
    await command().set(headers(admin.cookie)).set('X-CSRF-Token', '0'.repeat(64)).expect(403);
    // An admin of another event cannot reach this one through its own event id either.
    await correct(f.other, reg.id).set(headers(otherAdmin.cookie)).send(valid).expect(404);
    expect(await snapshot()).toEqual(before);
    expect(await audits()).toHaveLength(0);
  });

  it('rolls back the correction when the audit fact cannot be written (#104)', async () => {
    const f = await fixture();
    const { cookie } = await session('admin', f.event);
    const reg = await cashRegistration(f.event, 50000, 'R-1');
    const before = await snapshot();
    await client`ALTER TABLE registration_operation_audit ADD CONSTRAINT reject_cash_correction_test
      CHECK (operation_type <> 'cash_correction') NOT VALID`;
    try {
      await correct(f.event, reg.id).set(headers(cookie)).send(valid).expect(500);
    } finally {
      await client`ALTER TABLE registration_operation_audit DROP CONSTRAINT reject_cash_correction_test`;
    }
    expect(await snapshot()).toEqual(before);
    expect(await audits()).toHaveLength(0);
  });
});
