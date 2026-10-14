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
import type { FlaggedPayments } from '@/payments/review/flagged-payments.types';
import { PostgresHarness } from './support/postgres-harness';

jest.setTimeout(120_000);

const MINUTE = 60 * 1000;
const ago = (minutes: number) => new Date(Date.now() - minutes * MINUTE).toISOString();

describe('admin flagged payments (e2e)', () => {
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
      INSERT INTO events (organization_id, name, time_zone, slug)
      VALUES (${org}, 'One', 'Etc/UTC', 'event-one'), (${org}, 'Two', 'Etc/UTC', 'event-two')
      RETURNING id`;
    return { event: event.id, other: other.id };
  }
  async function session(role: string, eventId: string | null) {
    const [{ id: userId }] = await client<
      { id: string }[]
    >`INSERT INTO users (email, display_name, active) VALUES (${randomBytes(8).toString('hex') + '@example.com'}, 'Operator', true) RETURNING id`;
    await client`INSERT INTO user_roles (user_id, role, scope_type, scope_id)
      VALUES (${userId}, ${role}, ${eventId ? 'event' : 'global'}, ${eventId})`;
    const token = randomBytes(32).toString('hex');
    await client`INSERT INTO auth_sessions (user_id, token_digest, expires_at)
      VALUES (${userId}, ${createHash('sha256').update(token).digest('hex')}, now() + interval '1 hour')`;
    return `nb_admin_session=${token}`;
  }
  /** A registration with one checkout; returns the registration and checkout ids. */
  async function registration(
    eventId: string,
    name: string,
    status: 'pending_payment' | 'confirmed' | 'voided',
    folio: string | null = null,
  ) {
    const confirmed = status === 'confirmed';
    const [{ id }] = await client<{ id: string }[]>`
      WITH participant AS (INSERT INTO participants (full_name) VALUES (${name}) RETURNING id)
      INSERT INTO event_registrations (event_id, participant_id, status, confirmation_source,
          confirmed_at, folio)
      SELECT ${eventId}, id, ${status}, ${confirmed ? 'admin_cash' : null},
        ${confirmed ? new Date().toISOString() : null}, ${folio}
      FROM participant RETURNING id`;
    const [{ id: checkout }] = await client<{ id: string }[]>`
      INSERT INTO registration_checkouts (registration_id, mode, preference_id, amount_cents, currency)
      VALUES (${id}, 'sandbox', ${'pref-' + randomUUID()}, 150000, 'MXN') RETURNING id`;
    return { id, checkout };
  }
  /** A recorded Mercado Pago payment and its processed notifications, oldest first. */
  async function payment(
    checkout: string,
    paymentId: string,
    receivedMinutesAgo: number,
    outcomes: string[],
    amountCents = 150000,
  ) {
    await client`INSERT INTO registration_payments (checkout_id, provider_payment_id, status,
        amount_cents, currency, created_at)
      VALUES (${checkout}, ${paymentId}, 'approved', ${amountCents}, 'MXN', ${ago(receivedMinutesAgo)})`;
    for (const [index, outcome] of outcomes.entries()) {
      const at = ago(receivedMinutesAgo - index);
      await client`INSERT INTO payment_webhook_notifications (notification_id, provider_payment_id,
          received_at, processed_at, outcome)
        VALUES (${randomUUID()}, ${paymentId}, ${at}, ${at}, ${outcome})`;
    }
  }
  const read = (event: string) =>
    request(app.getHttpServer()).get(`/admin/events/${event}/flagged-payments`);

  it('lists each flagged payment once with its latest reason, newest first', async () => {
    const { event } = await fixture();
    const expired = await registration(event, 'Ana Duplicada', 'voided');
    const ended = await registration(event, 'Beto Tardío', 'voided');
    const confirmed = await registration(event, 'Carla Doble', 'confirmed', 'LMP-0001');
    const voided = await registration(event, 'Dani Anulada', 'voided');
    await payment(expired.checkout, '1001', 40, [
      'payment_pending',
      'approved_after_expiry_duplicate',
    ]);
    await payment(ended.checkout, '1002', 30, ['approved_after_expiry_event_ended']);
    // Mercado Pago notified this payment twice; it is still one row.
    await payment(confirmed.checkout, '1003', 20, [
      'approved_after_confirmation',
      'approved_after_confirmation',
    ]);
    await payment(voided.checkout, '1004', 10, ['approved_after_void'], 99000);
    const cookie = await session('admin', event);

    const response = await read(event).set('Cookie', cookie).expect(200);

    expect(response.body).toEqual({
      payments: [
        {
          providerPaymentId: '1004',
          reason: 'approved_after_void',
          receivedAt: expect.any(String) as string,
          amountCents: 99000,
          registration: {
            id: voided.id,
            folio: null,
            participantName: 'Dani Anulada',
            status: 'voided',
          },
        },
        {
          providerPaymentId: '1003',
          reason: 'approved_after_confirmation',
          receivedAt: expect.any(String) as string,
          amountCents: 150000,
          registration: {
            id: confirmed.id,
            folio: 'LMP-0001',
            participantName: 'Carla Doble',
            status: 'confirmed',
          },
        },
        {
          providerPaymentId: '1002',
          reason: 'approved_after_expiry_event_ended',
          receivedAt: expect.any(String) as string,
          amountCents: 150000,
          registration: {
            id: ended.id,
            folio: null,
            participantName: 'Beto Tardío',
            status: 'voided',
          },
        },
        {
          providerPaymentId: '1001',
          reason: 'approved_after_expiry_duplicate',
          receivedAt: expect.any(String) as string,
          amountCents: 150000,
          registration: {
            id: expired.id,
            folio: null,
            participantName: 'Ana Duplicada',
            status: 'voided',
          },
        },
      ],
    });
    const [first] = (response.body as FlaggedPayments).payments;
    expect(
      Math.abs(new Date(first.receivedAt).getTime() - (Date.now() - 10 * MINUTE)),
    ).toBeLessThan(MINUTE);
  });

  it('leaves out settled payments, later outcomes and other events', async () => {
    const { event, other } = await fixture();
    const paid = await registration(event, 'Pagó bien', 'confirmed', 'LMP-0002');
    const refunded = await registration(event, 'Reembolsada', 'voided');
    const unprocessed = await registration(event, 'Sin procesar', 'voided');
    const elsewhere = await registration(other, 'Otro evento', 'voided');
    await payment(paid.checkout, '2001', 30, ['payment_pending', 'confirmed', 'already_confirmed']);
    await payment(paid.checkout, '2002', 25, ['payment_rejected']);
    // Coordination refunded it in Mercado Pago; the refund is the payment's latest outcome.
    await payment(refunded.checkout, '2003', 20, ['approved_after_void', 'payment_refunded']);
    await payment(unprocessed.checkout, '2004', 15, []);
    await client`INSERT INTO payment_webhook_notifications (notification_id, provider_payment_id)
      VALUES ('claim-only', '2004')`;
    await payment(elsewhere.checkout, '2005', 10, ['approved_after_void']);
    const cookie = await session('admin', event);

    const response = await read(event).set('Cookie', cookie).expect(200);

    expect(response.body).toEqual({ payments: [] });
  });

  it('lets a global administrator read any event', async () => {
    const { event } = await fixture();
    const voided = await registration(event, 'Global', 'voided');
    await payment(voided.checkout, '3001', 5, ['approved_after_void']);
    const cookie = await session('admin', null);

    const response = await read(event).set('Cookie', cookie).expect(200);

    expect((response.body as FlaggedPayments).payments).toHaveLength(1);
  });

  it('returns 404 for an unknown event', async () => {
    await fixture();
    const cookie = await session('admin', null);
    await read(randomUUID()).set('Cookie', cookie).expect(404);
  });

  it('requires an admin session for this event', async () => {
    const { event, other } = await fixture();
    const judge = await session('judge', event);
    const otherAdmin = await session('admin', other);
    await read(event).expect(401);
    await read(event).set('Cookie', judge).expect(401);
    await read(event).set('Cookie', otherAdmin).expect(401);
  });
});
