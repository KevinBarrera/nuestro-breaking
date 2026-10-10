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
import { configureHttp } from '@/http';
import {
  CONFIRMATION_EMAIL_MAX_ATTEMPTS,
  ConfirmationEmailDispatcher,
  EmailSendError,
  EmailSender,
  type OutgoingEmail,
  type SentEmail,
} from '@/notifications';
import { MercadoPagoClient, type ProviderPayment } from '@/payments';
import { PostgresHarness } from './support/postgres-harness';

jest.setTimeout(120_000);

const WEBHOOK = '/public/payments/mercado-pago/webhook';
const PAYMENT_ID = '1234567890';
const FULL_CENTS = 150050;
const ADD_ON_CENTS = 80000;
const EMAIL = 'ana.buyer@example.test';

// Confirmation email dispatch (#179 D3) against PostgreSQL: the verified webhook confirms, the
// dispatcher sends through a stubbed `EmailSender`, and the outbox row records the result.
describe('Confirmation email dispatch (e2e)', () => {
  const harness = new PostgresHarness();
  let client: Sql;
  let app: INestApplication<App>;
  let dispatcher: ConfirmationEmailDispatcher;
  const payments = new Map<string, ProviderPayment>();
  const sent: OutgoingEmail[] = [];
  // Each test may replace how the stubbed transport answers; it records every call first.
  let answer: (call: number) => Promise<SentEmail>;
  const sender: EmailSender = {
    send: (message) => {
      sent.push(message);
      return answer(sent.length);
    },
  };
  const mercadoPago: MercadoPagoClient = {
    createPreference: () => Promise.reject(new Error('not used')),
    getPayment: (paymentId: string) => {
      const payment = payments.get(paymentId);
      return payment ? Promise.resolve({ ...payment }) : Promise.reject(new Error('not found'));
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
      .useValue(mercadoPago)
      .overrideProvider(EmailSender)
      .useValue(sender)
      .compile();
    app = moduleRef.createNestApplication<INestApplication<App>>();
    configureHttp(app, {});
    await app.init();
    dispatcher = app.get(ConfirmationEmailDispatcher);
  });
  beforeEach(async () => {
    payments.clear();
    sent.length = 0;
    answer = (call) => Promise.resolve({ providerMessageId: `<msg-${call}@smtp>` });
    await harness.reset();
  });
  afterEach(() => dispatcher.whenIdle());
  afterAll(async () => {
    await app?.close();
    await harness.stop();
  });

  const mode = () => process.env.MERCADO_PAGO_MODE ?? 'sandbox';

  /** A pending online registration with a full pass (two competitions) and an add-on (none). */
  async function pendingRegistration(email: string | null = EMAIL) {
    const [{ id: org }] = await client<
      { id: string }[]
    >`INSERT INTO organizations (name) VALUES ('Org') RETURNING id`;
    const [{ id: eventId }] = await client<{ id: string }[]>`
      INSERT INTO events (organization_id, name, time_zone, slug, folio_prefix, starts_at, ends_at)
      VALUES (${org}, 'Los más pesados', 'America/Mexico_City', 'lmp', 'LMP',
        '2026-11-20T15:00:00Z', '2026-11-21T05:00:00Z') RETURNING id`;
    const [{ id: venue }] = await client<{ id: string }[]>`
      INSERT INTO venues (organization_id, name) VALUES (${org}, 'Hall') RETURNING id`;
    await client`INSERT INTO event_venues (organization_id, event_id, venue_id)
      VALUES (${org}, ${eventId}, ${venue})`;
    const [breaking, popping] = await client<{ id: string }[]>`
      INSERT INTO activities (event_id, venue_id, kind, name, starts_at, ends_at)
      VALUES (${eventId}, ${venue}, 'battle', 'Breaking 1v1', '2026-11-20T18:00:00Z', '2026-11-20T20:00:00Z'),
        (${eventId}, ${venue}, 'battle', 'Popping 1v1', '2026-11-20T15:00:00Z', '2026-11-20T17:00:00Z')
      RETURNING id`;
    const [full, addOn] = await client<{ id: string }[]>`
      INSERT INTO event_pass_types (event_id, name, pass_class, price_cents, requires_pass_class, status)
      VALUES (${eventId}, 'Pase completo Breaking', 'full', ${FULL_CENTS}, NULL, 'active'),
        (${eventId}, 'Open Styles', 'add_on', ${ADD_ON_CENTS}, 'full', 'active')
      RETURNING id`;
    const [{ id }] = await client<{ id: string }[]>`
      WITH participant AS (
        INSERT INTO participants (full_name, first_name, first_last_name, email)
        VALUES ('Ana López', 'Ana', 'López', ${email}) RETURNING id)
      INSERT INTO event_registrations (event_id, participant_id, status)
      SELECT ${eventId}, id, 'pending_payment' FROM participant RETURNING id`;
    const [{ id: fullPass }] = await client<{ id: string }[]>`
      INSERT INTO event_registration_passes (event_id, event_registration_id, pass_type_id, price_cents)
      VALUES (${eventId}, ${id}, ${full.id}, ${FULL_CENTS}) RETURNING id`;
    for (const activity of [breaking, popping])
      await client`INSERT INTO event_registration_pass_selections (event_id, registration_pass_id, activity_id)
        VALUES (${eventId}, ${fullPass}, ${activity.id})`;
    await client`INSERT INTO event_registration_passes (event_id, event_registration_id, pass_type_id, price_cents)
      VALUES (${eventId}, ${id}, ${addOn.id}, ${ADD_ON_CENTS})`;
    await client`INSERT INTO registration_checkouts (registration_id, mode, preference_id, amount_cents, currency)
      VALUES (${id}, ${mode()}, 'pref-fake-1', ${FULL_CENTS + ADD_ON_CENTS}, 'MXN')`;
    return id;
  }

  function setPayment(registrationId: string, status = 'approved') {
    payments.set(PAYMENT_ID, {
      id: PAYMENT_ID,
      status,
      transactionAmountCents: FULL_CENTS + ADD_ON_CENTS,
      currencyId: 'MXN',
      externalReference: registrationId,
    });
  }

  /** A signed notification; resolves once the webhook answered and its dispatch settled. */
  async function notify(notificationId: number, expectedStatus = 200) {
    const requestId = `req-fake-${notificationId}`;
    const ts = String(Date.now());
    const v1 = createHmac('sha256', process.env.MERCADO_PAGO_WEBHOOK_SECRET ?? '')
      .update(`id:${PAYMENT_ID};request-id:${requestId};ts:${ts};`)
      .digest('hex');
    const response = await request(app.getHttpServer())
      .post(`${WEBHOOK}?data.id=${PAYMENT_ID}&type=payment`)
      .set('x-request-id', requestId)
      .set('x-signature', `ts=${ts},v1=${v1}`)
      .send({
        id: notificationId,
        type: 'payment',
        action: 'payment.updated',
        data: { id: PAYMENT_ID },
      })
      .expect(expectedStatus);
    await dispatcher.whenIdle();
    return response;
  }

  /** A confirmed registration with its queued email, without going through the webhook. */
  async function queuedRegistration(email: string | null = EMAIL) {
    const id = await pendingRegistration(email);
    await client`UPDATE event_registrations SET status = 'confirmed',
      confirmation_source = 'approved_payment', confirmed_at = now(), folio = 'LMP-AB12'
      WHERE id = ${id}`;
    await client`INSERT INTO registration_confirmation_emails (registration_id) VALUES (${id})`;
    return id;
  }

  type OutboxRow = {
    status: string;
    attempts: number;
    last_error_code: string | null;
    provider_message_id: string | null;
    sent: boolean;
    retry_in_seconds: number;
  };
  const outboxRows = () =>
    client<OutboxRow[]>`
      SELECT status, attempts, last_error_code, provider_message_id, sent_at IS NOT NULL AS sent,
        round(extract(epoch FROM next_attempt_at - now()))::int AS retry_in_seconds
      FROM registration_confirmation_emails`;
  const makeDue = () =>
    client`UPDATE registration_confirmation_emails SET next_attempt_at = now() - interval '1 second'`;
  const registrationRow = async (id: string) =>
    (
      await client<{ status: string; folio: string | null }[]>`
        SELECT status, folio FROM event_registrations WHERE id = ${id}`
    )[0];

  it('sends one email with the folio, passes and competitions when the webhook confirms', async () => {
    const id = await pendingRegistration();
    setPayment(id);

    await notify(1001);

    const { status, folio } = await registrationRow(id);
    expect(status).toBe('confirmed');
    expect(sent).toHaveLength(1);
    const [message] = sent;
    expect(message.to).toEqual({ email: EMAIL, name: 'Ana López' });
    expect(message.subject).toBe(
      `Tu inscripción a Los más pesados está confirmada · Folio ${folio}`,
    );
    for (const body of [message.text, message.html]) {
      expect(body).toContain('Hola, Ana');
      expect(body).toContain(folio);
      expect(body).toContain('viernes, 20 de noviembre de 2026');
      expect(body).toContain('Pase completo Breaking');
      // Competitions in start order.
      expect(body).toContain('Popping 1v1, Breaking 1v1');
      expect(body).toContain('Open Styles');
      expect(body).not.toContain(EMAIL);
      expect(body).not.toContain(PAYMENT_ID);
      expect(body).not.toMatch(/2[.,]?300|1[.,]?500|MXN/);
    }
    expect(await outboxRows()).toEqual([
      expect.objectContaining({
        status: 'sent',
        attempts: 1,
        last_error_code: null,
        provider_message_id: '<msg-1@smtp>',
        sent: true,
      }),
    ]);
  });

  it('sends once across concurrent, retried and different notifications of the same payment', async () => {
    const id = await pendingRegistration();
    setPayment(id);

    await Promise.all([notify(1001), notify(1001)]);
    await notify(1001);
    await notify(1002);

    expect(sent).toHaveLength(1);
    expect((await outboxRows())[0]).toMatchObject({ status: 'sent', attempts: 1 });
  });

  it('sends once when a pending OXXO or SPEI payment is approved later', async () => {
    const id = await pendingRegistration();
    setPayment(id, 'pending');

    await notify(1001);
    expect(sent).toHaveLength(0);

    setPayment(id, 'approved');
    await notify(1002);
    await notify(1003);

    expect(sent).toHaveLength(1);
    expect((await registrationRow(id)).status).toBe('confirmed');
  });

  it('keeps the confirmation and retries later with backoff when the send fails transiently', async () => {
    const id = await pendingRegistration();
    setPayment(id);
    answer = () => Promise.reject(new EmailSendError('provider_unavailable', true, 503));

    const response = await notify(1001);

    expect(response.body).toEqual({ received: true });
    expect((await registrationRow(id)).status).toBe('confirmed');
    const [row] = await outboxRows();
    expect(row).toMatchObject({
      status: 'pending',
      attempts: 1,
      last_error_code: 'provider_unavailable',
      sent: false,
    });
    // First backoff is one minute.
    expect(row.retry_in_seconds).toBeGreaterThan(50);
    expect(row.retry_in_seconds).toBeLessThanOrEqual(60);

    // Not due yet: a sweep leaves it alone.
    await dispatcher.sweep();
    expect(sent).toHaveLength(1);

    answer = () => Promise.resolve({ providerMessageId: '<retry@smtp>' });
    await makeDue();
    await dispatcher.sweep();
    await makeDue();
    await dispatcher.sweep();

    expect(sent).toHaveLength(2);
    expect(await outboxRows()).toEqual([
      expect.objectContaining({
        status: 'sent',
        attempts: 2,
        last_error_code: null,
        provider_message_id: '<retry@smtp>',
      }),
    ]);
  });

  it('treats an unexpected transport error as transient and still answers the webhook', async () => {
    const id = await pendingRegistration();
    setPayment(id);
    answer = () => Promise.reject(new Error('socket hang up'));

    await notify(1001);

    expect((await registrationRow(id)).status).toBe('confirmed');
    expect((await outboxRows())[0]).toMatchObject({
      status: 'pending',
      attempts: 1,
      last_error_code: 'unexpected',
    });
  });

  it('marks the email failed without touching the confirmation when the provider rejects it', async () => {
    const id = await pendingRegistration();
    setPayment(id);
    answer = () => Promise.reject(new EmailSendError('rejected', false, 400));

    await notify(1001);

    expect((await registrationRow(id)).status).toBe('confirmed');
    expect((await outboxRows())[0]).toMatchObject({
      status: 'failed',
      attempts: 1,
      last_error_code: 'rejected',
      sent: false,
    });

    await makeDue();
    await dispatcher.sweep();
    await dispatcher.dispatchRegistration(id);
    expect(sent).toHaveLength(1);
  });

  it('marks the email failed after the last allowed attempt', async () => {
    const id = await queuedRegistration();
    await client`UPDATE registration_confirmation_emails
      SET attempts = ${CONFIRMATION_EMAIL_MAX_ATTEMPTS - 1}`;
    answer = () => Promise.reject(new EmailSendError('rate_limited', true, 429));

    await dispatcher.dispatchRegistration(id);

    expect((await outboxRows())[0]).toMatchObject({
      status: 'failed',
      attempts: CONFIRMATION_EMAIL_MAX_ATTEMPTS,
      last_error_code: 'rate_limited',
    });
  });

  it('marks the email failed when the buyer has no email address', async () => {
    const id = await queuedRegistration(null);

    await dispatcher.dispatchRegistration(id);

    expect(sent).toHaveLength(0);
    expect((await outboxRows())[0]).toMatchObject({
      status: 'failed',
      attempts: 1,
      last_error_code: 'missing_recipient',
    });
  });

  it('sends once when sweeps and immediate dispatches run at the same time', async () => {
    const id = await queuedRegistration();
    answer = (call) =>
      new Promise((resolve) =>
        setTimeout(() => resolve({ providerMessageId: `<msg-${call}@smtp>` }), 200),
      );

    await Promise.all([
      dispatcher.sweep(),
      dispatcher.sweep(),
      dispatcher.dispatchRegistration(id),
      dispatcher.dispatchRegistration(id),
    ]);

    expect(sent).toHaveLength(1);
    expect((await outboxRows())[0]).toMatchObject({ status: 'sent', attempts: 1 });
  });

  it('never sends a sent email again', async () => {
    const id = await queuedRegistration();
    await dispatcher.dispatchRegistration(id);

    await makeDue();
    await dispatcher.sweep();
    await dispatcher.dispatchRegistration(id);

    expect(sent).toHaveLength(1);
  });

  it('keeps a newer outcome when a worker whose lease expired finishes late', async () => {
    const id = await queuedRegistration();
    let releaseFirst: () => void = () => undefined;
    answer = (call) =>
      call === 1
        ? new Promise((_resolve, reject) => {
            releaseFirst = () => reject(new EmailSendError('rejected', false, 400));
          })
        : Promise.resolve({ providerMessageId: '<second@smtp>' });

    const first = dispatcher.dispatchRegistration(id);
    await new Promise((resolve) => setTimeout(resolve, 100));
    // The first worker's lease runs out while it is still waiting on the provider.
    await makeDue();
    await dispatcher.sweep();
    releaseFirst();
    await first;

    expect(sent).toHaveLength(2);
    expect((await outboxRows())[0]).toMatchObject({
      status: 'sent',
      attempts: 2,
      provider_message_id: '<second@smtp>',
      last_error_code: null,
    });
  });

  it('leaves no queued email when the confirmation transaction aborts after queuing it', async () => {
    const id = await pendingRegistration();
    setPayment(id);
    // The webhook's last write, marking the notification processed, fails after `confirm` queued
    // the email in the same transaction.
    await client.unsafe(`
      CREATE FUNCTION fail_processed_mark() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'forced failure after confirm'; END $$;
      CREATE TRIGGER fail_processed_mark BEFORE UPDATE OF processed_at
        ON payment_webhook_notifications FOR EACH ROW EXECUTE FUNCTION fail_processed_mark();`);

    await notify(1001, 500);

    expect(await registrationRow(id)).toEqual({ status: 'pending_payment', folio: null });
    expect(await outboxRows()).toHaveLength(0);
    expect(sent).toHaveLength(0);
  });
});
