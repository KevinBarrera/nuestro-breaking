import { createHmac } from 'node:crypto';
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
import { MercadoPagoClient, type ProviderPayment } from '@/payments';
import { PostgresHarness } from './support/postgres-harness';

jest.setTimeout(120_000);

const WEBHOOK = '/public/payments/mercado-pago/webhook';
const PAYMENT_ID = '1234567890';
const PRICE_CENTS = 150050;

// Verified Mercado Pago webhook (#177 D11) against PostgreSQL. The client is a stub whose
// `getPayment` answers what each test sets; requests are signed here with the fake secret.
describe('Mercado Pago payment webhook (e2e)', () => {
  const harness = new PostgresHarness();
  let client: Sql;
  let app: INestApplication<App>;
  const payments = new Map<string, ProviderPayment>();
  let failingReads = 0;
  const reads: string[] = [];
  const stub: MercadoPagoClient = {
    createPreference: () => Promise.reject(new Error('not used')),
    getPayment: (paymentId: string) => {
      reads.push(paymentId);
      const payment = payments.get(paymentId);
      if (failingReads > 0 || !payment) {
        failingReads -= 1;
        return Promise.reject(new Error('provider down'));
      }
      return Promise.resolve({ ...payment });
    },
  };

  beforeAll(async () => {
    client = await harness.start();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(DatabaseService)
      .useValue({ db: {} })
      .overrideProvider(DATABASE_CLIENT)
      .useValue(drizzle({ client, schema }))
      .overrideProvider(MercadoPagoClient)
      .useValue(stub)
      .compile();
    app = moduleRef.createNestApplication<INestApplication<App>>();
    await app.init();
  });
  beforeEach(async () => {
    payments.clear();
    reads.length = 0;
    failingReads = 0;
    await harness.reset();
  });
  afterAll(async () => {
    await app?.close();
    await harness.stop();
  });

  const mode = () => process.env.MERCADO_PAGO_MODE ?? 'sandbox';

  async function pendingRegistration(status: 'pending_payment' | 'confirmed' = 'pending_payment') {
    const [{ id: org }] = await client<
      { id: string }[]
    >`INSERT INTO organizations (name) VALUES ('Org') RETURNING id`;
    const [{ id: eventId }] = await client<{ id: string }[]>`
      INSERT INTO events (organization_id, name, time_zone, slug, folio_prefix)
      VALUES (${org}, 'Los más pesados', 'America/Mexico_City', 'lmp', 'LMP') RETURNING id`;
    const [{ id: passTypeId }] = await client<{ id: string }[]>`
      INSERT INTO event_pass_types (event_id, name, pass_class, price_cents, requires_pass_class, status)
      VALUES (${eventId}, 'Pase completo', 'full', ${PRICE_CENTS}, NULL, 'active') RETURNING id`;
    const confirmed = status === 'confirmed';
    const [{ id }] = await client<{ id: string }[]>`
      WITH participant AS (INSERT INTO participants (full_name) VALUES ('Buyer') RETURNING id)
      INSERT INTO event_registrations (event_id, participant_id, status, confirmation_source,
          confirmed_at, folio)
      SELECT ${eventId}, id, ${status}, ${confirmed ? 'admin_cash' : null},
        ${confirmed ? new Date().toISOString() : null}, ${confirmed ? 'LMP-2345' : null}
      FROM participant RETURNING id`;
    await client`INSERT INTO event_registration_passes (event_id, event_registration_id, pass_type_id, price_cents)
      VALUES (${eventId}, ${id}, ${passTypeId}, ${PRICE_CENTS})`;
    await client`INSERT INTO registration_checkouts (registration_id, mode, preference_id, amount_cents, currency)
      VALUES (${id}, ${mode()}, 'pref-fake-1', ${PRICE_CENTS}, 'MXN')`;
    return id;
  }

  function setPayment(registrationId: string, overrides: Partial<ProviderPayment> = {}) {
    payments.set(PAYMENT_ID, {
      id: PAYMENT_ID,
      status: 'approved',
      transactionAmountCents: PRICE_CENTS,
      currencyId: 'MXN',
      externalReference: registrationId,
      liveMode: mode() === 'production',
      ...overrides,
    });
  }

  function notify(
    notificationId: number,
    options: { type?: string; dataId?: string; secret?: string; signature?: string | null } = {},
  ) {
    const { type = 'payment', dataId = PAYMENT_ID } = options;
    const secret = options.secret ?? process.env.MERCADO_PAGO_WEBHOOK_SECRET ?? '';
    const requestId = `req-fake-${notificationId}`;
    const ts = String(Date.now());
    const v1 = createHmac('sha256', secret)
      .update(`id:${dataId.toLowerCase()};request-id:${requestId};ts:${ts};`)
      .digest('hex');
    const call = request(app.getHttpServer())
      .post(`${WEBHOOK}?data.id=${dataId}&type=${type}`)
      .set('x-request-id', requestId);
    if (options.signature !== null)
      call.set('x-signature', options.signature ?? `ts=${ts},v1=${v1}`);
    return call.send({ id: notificationId, type, action: 'payment.updated', data: { id: dataId } });
  }

  const registrationRow = async (id: string) =>
    (
      await client<{ status: string; confirmation_source: string | null; folio: string | null }[]>`
        SELECT status, confirmation_source, folio FROM event_registrations WHERE id = ${id}`
    )[0];
  const paymentRows = () =>
    client`SELECT provider_payment_id, status, amount_cents, currency FROM registration_payments`;
  const auditRows = () =>
    client`SELECT actor_kind, actor_user_id, session_id, amount_cents, reference, facts, registration_id
      FROM registration_operation_audit WHERE operation_type = 'payment_approval'`;
  const notificationRows = () =>
    client<{ notification_id: string; processed: boolean; outcome: string | null }[]>`
      SELECT notification_id, processed_at IS NOT NULL AS processed, outcome FROM payment_webhook_notifications
      ORDER BY received_at`;

  it.each([
    ['a missing signature', { signature: null }],
    ['a signature made with another secret', { secret: 'another-fake-secret' }],
    ['a malformed signature', { signature: 'ts=1,v1=zz' }],
  ])('answers 401 and writes nothing for %s', async (_label, options) => {
    const id = await pendingRegistration();
    setPayment(id);

    await notify(1001, options).expect(401);

    expect(await notificationRows()).toHaveLength(0);
    expect(await paymentRows()).toHaveLength(0);
    expect((await registrationRow(id)).status).toBe('pending_payment');
    expect(reads).toHaveLength(0);
  });

  it('confirms the registration for an approved payment of the full amount', async () => {
    const id = await pendingRegistration();
    setPayment(id);

    const response = await notify(1001).expect(200);

    expect(response.body).toEqual({ received: true });
    const registration = await registrationRow(id);
    expect(registration).toMatchObject({
      status: 'confirmed',
      confirmation_source: 'approved_payment',
    });
    expect(registration.folio).toMatch(/^LMP-[A-Z0-9]{4}$/);
    expect(await paymentRows()).toEqual([
      {
        provider_payment_id: PAYMENT_ID,
        status: 'approved',
        amount_cents: PRICE_CENTS,
        currency: 'MXN',
      },
    ]);
    const audit = await auditRows();
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({
      actor_kind: 'system',
      actor_user_id: null,
      session_id: null,
      amount_cents: PRICE_CENTS,
      reference: PAYMENT_ID,
      registration_id: id,
    });
    expect(JSON.stringify(audit[0].facts)).not.toMatch(/Buyer|signature|secret/);
    expect(await notificationRows()).toEqual([
      { notification_id: '1001', processed: true, outcome: 'confirmed' },
    ]);
  });

  it('processes the same notification once, even when it arrives twice at the same time', async () => {
    const id = await pendingRegistration();
    setPayment(id);

    await Promise.all([notify(1001).expect(200), notify(1001).expect(200)]);
    const folio = (await registrationRow(id)).folio;
    await notify(1001).expect(200);

    expect(await auditRows()).toHaveLength(1);
    expect((await registrationRow(id)).folio).toBe(folio);
    expect(await notificationRows()).toEqual([
      { notification_id: '1001', processed: true, outcome: 'confirmed' },
    ]);
  });

  it('confirms once when two different notifications report the same approved payment', async () => {
    const id = await pendingRegistration();
    setPayment(id);

    await Promise.all([notify(1001).expect(200), notify(1002).expect(200)]);

    expect(await auditRows()).toHaveLength(1);
    expect(await paymentRows()).toHaveLength(1);
    const outcomes = (await notificationRows()).map((row) => row.outcome).sort();
    expect(outcomes).toEqual(['already_confirmed', 'confirmed']);
  });

  it('acts on the re-read payment when notifications arrive out of order', async () => {
    const id = await pendingRegistration();
    // The "pending" notification is delivered after the payment was already approved.
    setPayment(id, { status: 'approved' });

    await notify(1001).expect(200);
    expect((await registrationRow(id)).status).toBe('confirmed');

    setPayment(id, { status: 'pending' });
    await notify(1002).expect(200);
    expect((await registrationRow(id)).status).toBe('confirmed');
    expect((await notificationRows()).map((row) => row.outcome)).toEqual([
      'confirmed',
      'payment_pending',
    ]);
  });

  it('keeps the registration pending for a rejected payment', async () => {
    const id = await pendingRegistration();
    setPayment(id, { status: 'rejected' });

    await notify(1001).expect(200);

    expect((await registrationRow(id)).status).toBe('pending_payment');
    expect(await paymentRows()).toEqual([
      expect.objectContaining({ provider_payment_id: PAYMENT_ID, status: 'rejected' }),
    ]);
    expect(await auditRows()).toHaveLength(0);
    expect((await notificationRows())[0].outcome).toBe('payment_rejected');
  });

  it('records an amount mismatch without confirming', async () => {
    const id = await pendingRegistration();
    setPayment(id, { transactionAmountCents: PRICE_CENTS - 1 });

    await notify(1001).expect(200);

    expect((await registrationRow(id)).status).toBe('pending_payment');
    expect(await auditRows()).toHaveLength(0);
    expect((await notificationRows())[0].outcome).toBe('amount_mismatch');
  });

  it('does not confirm a payment from the other mode', async () => {
    const id = await pendingRegistration();
    setPayment(id, { liveMode: mode() !== 'production' });

    await notify(1001).expect(200);

    expect((await registrationRow(id)).status).toBe('pending_payment');
    expect((await notificationRows())[0].outcome).toBe('mode_mismatch');
  });

  it('flags an approval for a registration already confirmed by cash', async () => {
    const id = await pendingRegistration('confirmed');
    setPayment(id);

    await notify(1001).expect(200);

    expect(await registrationRow(id)).toEqual({
      status: 'confirmed',
      confirmation_source: 'admin_cash',
      folio: 'LMP-2345',
    });
    expect(await auditRows()).toHaveLength(0);
    expect(await paymentRows()).toEqual([expect.objectContaining({ status: 'approved' })]);
    expect((await notificationRows())[0].outcome).toBe('approved_after_confirmation');
  });

  it('records an unknown registration without writing a payment', async () => {
    await pendingRegistration();
    setPayment('11111111-1111-4111-8111-111111111111');

    await notify(1001).expect(200);

    expect(await paymentRows()).toHaveLength(0);
    expect((await notificationRows())[0].outcome).toBe('unknown_registration');
  });

  it('answers 500 when the payment read fails and succeeds on the retry', async () => {
    const id = await pendingRegistration();
    setPayment(id);
    failingReads = 1;

    const failed = await notify(1001).expect(500);

    expect(JSON.stringify(failed.body)).not.toMatch(/provider down|TEST-|secret/);
    expect(await notificationRows()).toEqual([
      { notification_id: '1001', processed: false, outcome: null },
    ]);
    expect((await registrationRow(id)).status).toBe('pending_payment');

    await notify(1001).expect(200);

    expect((await registrationRow(id)).status).toBe('confirmed');
    expect(await notificationRows()).toEqual([
      { notification_id: '1001', processed: true, outcome: 'confirmed' },
    ]);
  });

  it('acknowledges and ignores a verified notification that is not about a payment', async () => {
    const id = await pendingRegistration();
    setPayment(id);

    await notify(1001, { type: 'merchant_order' }).expect(200);

    expect(reads).toHaveLength(0);
    expect(await notificationRows()).toHaveLength(0);
    expect((await registrationRow(id)).status).toBe('pending_payment');
  });
});
