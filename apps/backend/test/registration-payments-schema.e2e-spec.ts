import { type Sql } from 'postgres';
import { PostgresHarness } from './support/postgres-harness';

jest.setTimeout(120_000);

// Database contract for Mercado Pago Checkout Pro records (#177 D4, D5): one checkout per preference,
// one payment per provider payment id, and an idempotent webhook notification log. Fixtures use
// obviously fake provider ids; no card data or provider payloads are stored.
describe('registration payments schema (e2e)', () => {
  const harness = new PostgresHarness();
  let client: Sql;

  beforeAll(async () => {
    client = await harness.start();
  });
  beforeEach(async () => harness.reset());
  afterAll(async () => harness.stop());

  async function pendingRegistration() {
    const [{ id: org }] = await client<
      { id: string }[]
    >`INSERT INTO organizations (name) VALUES ('Org') RETURNING id`;
    const [{ id: eventId }] = await client<{ id: string }[]>`
      INSERT INTO events (organization_id, name, time_zone)
      VALUES (${org}, 'Event', 'Etc/UTC') RETURNING id`;
    const [{ id }] = await client<{ id: string }[]>`
      WITH participant AS (INSERT INTO participants (full_name) VALUES ('Buyer') RETURNING id)
      INSERT INTO event_registrations (event_id, participant_id)
      SELECT ${eventId}, id FROM participant RETURNING id`;
    return id;
  }

  function checkout(
    registrationId: string,
    overrides: Partial<{
      mode: string;
      preferenceId: string;
      amount: number;
      currency: string;
    }> = {},
  ) {
    const {
      mode = 'sandbox',
      preferenceId = 'pref-fake-1',
      amount = 50000,
      currency = 'MXN',
    } = overrides;
    return client<{ id: string }[]>`
      INSERT INTO registration_checkouts (registration_id, mode, preference_id, amount_cents, currency)
      VALUES (${registrationId}, ${mode}, ${preferenceId}, ${amount}, ${currency}) RETURNING id`;
  }

  function payment(
    checkoutId: string,
    overrides: Partial<{
      paymentId: string;
      status: string;
      amount: number;
      currency: string;
    }> = {},
  ) {
    const {
      paymentId = 'pay-fake-1',
      status = 'approved',
      amount = 50000,
      currency = 'MXN',
    } = overrides;
    return client`
      INSERT INTO registration_payments (checkout_id, provider_payment_id, status, amount_cents, currency)
      VALUES (${checkoutId}, ${paymentId}, ${status}, ${amount}, ${currency})`;
  }

  function notification(notificationId: string, outcome: string | null = null) {
    return client`
      INSERT INTO payment_webhook_notifications (notification_id, provider_payment_id, outcome)
      VALUES (${notificationId}, 'pay-fake-1', ${outcome})`;
  }

  const violation = (code: string, constraint: string) => ({ code, constraint_name: constraint });

  it('stores a checkout, its payments and a processed notification', async () => {
    const registrationId = await pendingRegistration();
    const [{ id: checkoutId }] = await checkout(registrationId);
    // A rejected card followed by a retry produces two payments for one preference.
    await payment(checkoutId, { paymentId: 'pay-fake-1', status: 'rejected' });
    await payment(checkoutId, { paymentId: 'pay-fake-2', status: 'approved' });
    await notification('notif-fake-1');
    await client`UPDATE payment_webhook_notifications SET processed_at = now(), outcome = 'confirmed'
      WHERE notification_id = 'notif-fake-1'`;

    const payments = await client`
      SELECT p.provider_payment_id, p.status, c.registration_id FROM registration_payments p
      JOIN registration_checkouts c ON c.id = p.checkout_id ORDER BY p.provider_payment_id`;
    expect(payments).toEqual([
      { provider_payment_id: 'pay-fake-1', status: 'rejected', registration_id: registrationId },
      { provider_payment_id: 'pay-fake-2', status: 'approved', registration_id: registrationId },
    ]);
    const logged = await client`SELECT received_at IS NOT NULL AS received,
      processed_at IS NOT NULL AS processed, outcome
      FROM payment_webhook_notifications WHERE notification_id = 'notif-fake-1'`;
    expect(logged).toEqual([{ received: true, processed: true, outcome: 'confirmed' }]);
  });

  it('rejects duplicate preference, payment and notification ids', async () => {
    const registrationId = await pendingRegistration();
    const [{ id: checkoutId }] = await checkout(registrationId);
    await expect(checkout(registrationId)).rejects.toMatchObject(
      violation('23505', 'registration_checkouts_preference_id_uq'),
    );
    await payment(checkoutId);
    await expect(payment(checkoutId)).rejects.toMatchObject(
      violation('23505', 'registration_payments_provider_payment_id_uq'),
    );
    await notification('notif-fake-1');
    await expect(notification('notif-fake-1')).rejects.toMatchObject(
      violation('23505', 'payment_webhook_notifications_notification_id_uq'),
    );
  });

  it('rejects a checkout with an unknown registration, invalid mode, currency or amount', async () => {
    const registrationId = await pendingRegistration();
    await expect(
      checkout('00000000-0000-4000-8000-000000000000', { preferenceId: 'pref-fake-2' }),
    ).rejects.toMatchObject(violation('23503', 'registration_checkouts_registration_fk'));
    await expect(checkout(registrationId, { mode: 'live' })).rejects.toMatchObject(
      violation('23514', 'registration_checkouts_mode_ck'),
    );
    await expect(checkout(registrationId, { currency: 'USD' })).rejects.toMatchObject(
      violation('23514', 'registration_checkouts_currency_ck'),
    );
    for (const amount of [0, -100])
      await expect(checkout(registrationId, { amount })).rejects.toMatchObject(
        violation('23514', 'registration_checkouts_amount_cents_ck'),
      );
  });

  it("rejects a payment with an unknown status, currency or amount and accepts Mercado Pago's statuses", async () => {
    const [{ id: checkoutId }] = await checkout(await pendingRegistration());
    await expect(payment(checkoutId, { status: 'paid' })).rejects.toMatchObject(
      violation('23514', 'registration_payments_status_ck'),
    );
    await expect(payment(checkoutId, { currency: 'USD' })).rejects.toMatchObject(
      violation('23514', 'registration_payments_currency_ck'),
    );
    for (const amount of [0, -100])
      await expect(payment(checkoutId, { amount })).rejects.toMatchObject(
        violation('23514', 'registration_payments_amount_cents_ck'),
      );
    const statuses = [
      'pending',
      'approved',
      'authorized',
      'in_process',
      'in_mediation',
      'rejected',
      'cancelled',
      'refunded',
      'charged_back',
    ];
    for (const [index, status] of statuses.entries())
      await payment(checkoutId, { paymentId: `pay-fake-${index + 10}`, status });
    const [{ count }] = await client<{ count: number }[]>`
      SELECT count(*)::int AS count FROM registration_payments`;
    expect(count).toBe(statuses.length);
  });

  it('rejects an overlong notification outcome code', async () => {
    await expect(notification('notif-fake-2', 'x'.repeat(65))).rejects.toMatchObject(
      violation('23514', 'payment_webhook_notifications_outcome_ck'),
    );
  });
});
