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
import { MercadoPagoClient, type PreferenceRequest } from '@/payments';
import { PostgresHarness } from './support/postgres-harness';

jest.setTimeout(120_000);

const DAY = 24 * 60 * 60 * 1000;
const SLUG = 'los-mas-pesados-nov-2026';
const CHECKOUT_URL = 'https://example.test/checkout/sandbox/pref-fake-1';

// Checkout Pro preference creation (#177 D8) against PostgreSQL, with the Mercado Pago client
// replaced by a stub that records what would be sent.
describe('public checkout (e2e)', () => {
  const harness = new PostgresHarness();
  let client: Sql;
  let app: INestApplication<App>;
  const sent: PreferenceRequest[] = [];
  let failNext = false;
  let preferenceCount = 0;
  // Runs while the provider call is in flight, to simulate what happens meanwhile.
  let duringPreference: (() => Promise<unknown>) | null = null;
  const stub: MercadoPagoClient = {
    createPreference: async (input: PreferenceRequest) => {
      sent.push(input);
      if (duringPreference) await duringPreference();
      if (failNext) return Promise.reject(new Error('provider down'));
      preferenceCount += 1;
      return Promise.resolve({
        preferenceId: `pref-fake-${preferenceCount}`,
        checkoutUrl: CHECKOUT_URL,
      });
    },
    getPayment: () => Promise.reject(new Error('not used')),
  };

  beforeAll(async () => {
    process.env.PUBLIC_RATE_LIMIT_LIMIT = '10000';
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
    sent.length = 0;
    failNext = false;
    duringPreference = null;
    preferenceCount = 0;
    await harness.reset();
  });
  afterAll(async () => {
    delete process.env.PUBLIC_RATE_LIMIT_LIMIT;
    await app?.close();
    await harness.stop();
  });

  async function fixture() {
    const [{ id: org }] = await client<
      { id: string }[]
    >`INSERT INTO organizations (name) VALUES ('Org') RETURNING id`;
    const opensAt = new Date(Date.now() - DAY).toISOString();
    const [event, other] = await client<{ id: string }[]>`
      INSERT INTO events (organization_id, name, time_zone, slug, sales_enabled, sales_opens_at)
      VALUES (${org}, 'Los más pesados', 'America/Mexico_City', ${SLUG}, true, ${opensAt}),
        (${org}, 'Other', 'Etc/UTC', 'other-event', true, ${opensAt})
      RETURNING id`;
    const [full, addOn, foreign] = await client<{ id: string }[]>`
      INSERT INTO event_pass_types (event_id, name, pass_class, price_cents, requires_pass_class, status)
      VALUES (${event.id}, 'Pase completo Breaking', 'full', 150050, NULL, 'active'),
        (${event.id}, 'Open Styles', 'add_on', 80000, 'full', 'active'),
        (${other.id}, 'Foreign pass', 'full', 1000, NULL, 'active')
      RETURNING id`;
    return {
      event: event.id,
      other: other.id,
      full: full.id,
      addOn: addOn.id,
      foreign: foreign.id,
    };
  }

  async function registration(
    eventId: string,
    passes: { passTypeId: string; priceCents: number }[],
    status: 'pending_payment' | 'confirmed' | 'voided' = 'pending_payment',
  ) {
    const confirmed = status === 'confirmed';
    const [{ id }] = await client<{ id: string }[]>`
      WITH participant AS (INSERT INTO participants (full_name) VALUES ('Buyer') RETURNING id)
      INSERT INTO event_registrations (event_id, participant_id, status, confirmation_source,
          confirmed_at, folio, expires_at)
      SELECT ${eventId}, id, ${status}, ${confirmed ? 'admin_cash' : null},
        ${confirmed ? new Date().toISOString() : null}, ${confirmed ? 'LMP-0001' : null},
        now() + interval '96 hours'
      FROM participant RETURNING id`;
    for (const pass of passes)
      await client`INSERT INTO event_registration_passes (event_id, event_registration_id, pass_type_id, price_cents)
        VALUES (${eventId}, ${id}, ${pass.passTypeId}, ${pass.priceCents})`;
    return id;
  }

  const checkout = (registrationId: string, slug = SLUG) =>
    request(app.getHttpServer()).post(
      `/public/events/${slug}/registrations/${registrationId}/checkout`,
    );
  const checkoutRows = () =>
    client`SELECT registration_id, mode, preference_id, amount_cents, currency FROM registration_checkouts`;

  it('creates a preference with one item per pass snapshot and records the checkout', async () => {
    const ids = await fixture();
    // The snapshot price wins over the current catalog price.
    const id = await registration(ids.event, [
      { passTypeId: ids.full, priceCents: 150050 },
      { passTypeId: ids.addOn, priceCents: 70000 },
    ]);
    await client`UPDATE event_pass_types SET price_cents = 999999 WHERE id = ${ids.addOn}`;

    const response = await checkout(id).expect(201);

    expect(response.body).toEqual({ checkoutUrl: CHECKOUT_URL });
    const returnUrl = `${process.env.PUBLIC_APP_URL}/e/${SLUG}/pago?registration=${id}`;
    expect(sent).toEqual([
      {
        items: [
          { title: 'Pase completo Breaking', quantity: 1, unit_price: 1500.5, currency_id: 'MXN' },
          { title: 'Open Styles', quantity: 1, unit_price: 700, currency_id: 'MXN' },
        ],
        external_reference: id,
        back_urls: { success: returnUrl, failure: returnUrl, pending: returnUrl },
        auto_return: 'approved',
        notification_url: process.env.MERCADO_PAGO_NOTIFICATION_URL,
        date_of_expiration: expect.stringMatching(/\+00:00$/) as unknown,
      },
    ]);
    expect(await checkoutRows()).toEqual([
      {
        registration_id: id,
        mode: process.env.MERCADO_PAGO_MODE,
        preference_id: 'pref-fake-1',
        amount_cents: 220050,
        currency: 'MXN',
      },
    ]);
  });

  it('ends the offline payment window after 72 hours and keeps the registration one day longer', async () => {
    const ids = await fixture();
    const id = await registration(ids.event, [{ passTypeId: ids.full, priceCents: 150050 }]);
    const before = Date.now();

    await checkout(id).expect(201);

    const due = new Date(sent[0].date_of_expiration!).getTime();
    expect(due).toBeGreaterThanOrEqual(before + 3 * DAY);
    expect(due).toBeLessThanOrEqual(Date.now() + 3 * DAY);
    const [row] = await client<{ expires_at: string }[]>`
      SELECT expires_at FROM event_registrations WHERE id = ${id}`;
    expect(new Date(row.expires_at).getTime()).toBe(due + DAY);
  });

  it('keeps an admin manual registration without expiry when it is paid online', async () => {
    const ids = await fixture();
    // Rows created by the fixture are online ones; an admin manual registration has no expiry.
    const id = await registration(ids.event, [{ passTypeId: ids.full, priceCents: 150050 }]);
    await client`UPDATE event_registrations SET expires_at = NULL WHERE id = ${id}`;

    await checkout(id).expect(201);

    expect(sent[0].date_of_expiration).toMatch(/\+00:00$/);
    const [row] = await client`SELECT expires_at FROM event_registrations WHERE id = ${id}`;
    expect(row.expires_at).toBeNull();
  });

  it('voids an expired registration and answers 409 without calling the provider', async () => {
    const ids = await fixture();
    const id = await registration(ids.event, [{ passTypeId: ids.full, priceCents: 150050 }]);
    await client`UPDATE event_registrations SET expires_at = now() - interval '1 minute' WHERE id = ${id}`;

    const response = await checkout(id).expect(409);

    expect(response.body).toMatchObject({ code: 'registration_not_payable' });
    expect(sent).toHaveLength(0);
    const [row] = await client`SELECT status FROM event_registrations WHERE id = ${id}`;
    expect(row.status).toBe('voided');
    const [fact] = await client`SELECT actor_kind FROM registration_operation_audit
      WHERE registration_id = ${id} AND operation_type = 'registration_expiry'`;
    expect(fact).toEqual({ actor_kind: 'system' });
  });

  it.each([
    ['voided', `status = 'voided'`],
    [
      'confirmed',
      `status = 'confirmed', confirmation_source = 'approved_payment', confirmed_at = now(), folio = 'LMP-0002'`,
    ],
  ])(
    'answers 409 and records no checkout when the registration is %s during the provider call',
    async (_, change) => {
      const ids = await fixture();
      const id = await registration(ids.event, [{ passTypeId: ids.full, priceCents: 150050 }]);
      duringPreference = () =>
        client.unsafe(`UPDATE event_registrations SET ${change} WHERE id = $1`, [id]);

      const response = await checkout(id).expect(409);

      expect(response.body).toMatchObject({ code: 'registration_not_payable' });
      expect(await checkoutRows()).toEqual([]);
    },
  );

  it('creates a fresh preference on every call', async () => {
    const ids = await fixture();
    const id = await registration(ids.event, [{ passTypeId: ids.full, priceCents: 150050 }]);

    await checkout(id).expect(201);
    await checkout(id).expect(201);

    expect(sent).toHaveLength(2);
    expect(await checkoutRows()).toHaveLength(2);
  });

  it.each(['confirmed', 'voided'] as const)(
    'rejects a %s registration without calling the provider',
    async (status) => {
      const ids = await fixture();
      const id = await registration(
        ids.event,
        [{ passTypeId: ids.full, priceCents: 150050 }],
        status,
      );

      const response = await checkout(id).expect(409);

      expect(response.body).toEqual({
        statusCode: 409,
        code: 'registration_not_payable',
        message: 'This registration cannot be paid online.',
      });
      expect(sent).toHaveLength(0);
      expect(await checkoutRows()).toHaveLength(0);
    },
  );

  it('rejects a pending registration with no paid passes without calling the provider', async () => {
    const ids = await fixture();
    const free = await registration(ids.event, [{ passTypeId: ids.full, priceCents: 0 }]);
    const empty = await registration(ids.event, []);

    await checkout(free).expect(409);
    await checkout(empty).expect(409);

    expect(sent).toHaveLength(0);
    expect(await checkoutRows()).toHaveLength(0);
  });

  it('answers 404 for a registration of another event or an unknown one', async () => {
    const ids = await fixture();
    const foreign = await registration(ids.other, [{ passTypeId: ids.foreign, priceCents: 1000 }]);

    const fromOtherEvent = await checkout(foreign).expect(404);
    await checkout('11111111-1111-4111-8111-111111111111').expect(404);

    expect(fromOtherEvent.body).toEqual({
      statusCode: 404,
      message: 'Registration not found',
      error: 'Not Found',
    });
    expect(JSON.stringify(fromOtherEvent.body)).not.toContain('Foreign');
    expect(sent).toHaveLength(0);
  });

  it('rejects a registration id that is not a uuid', async () => {
    await fixture();

    await checkout('not-a-uuid').expect(400);

    expect(sent).toHaveLength(0);
  });

  it('answers 502 and writes nothing when the provider fails', async () => {
    const ids = await fixture();
    const id = await registration(ids.event, [{ passTypeId: ids.full, priceCents: 150050 }]);
    failNext = true;

    const response = await checkout(id).expect(502);

    expect(response.body).toEqual({
      statusCode: 502,
      code: 'payment_provider_unavailable',
      message: 'The payment provider is unavailable. Please try again.',
    });
    expect(sent).toHaveLength(1);
    expect(await checkoutRows()).toHaveLength(0);
  });
});
