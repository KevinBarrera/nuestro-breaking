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
import { MercadoPagoClient } from '@/payments';
import { PostgresHarness } from './support/postgres-harness';

jest.setTimeout(120_000);

const DAY = 24 * 60 * 60 * 1000;
const SLUG = 'los-mas-pesados-nov-2026';
const EMAIL = 'ana.lopez@gmail.com';
const PHONE = '+52 55 1234 5678';

// The return page's payment result (#178 D3, D4) against PostgreSQL. The status is read from the
// registration and its recorded payments only; Mercado Pago is never called.
describe('public payment status (e2e)', () => {
  const harness = new PostgresHarness();
  let client: Sql;
  let app: INestApplication<App>;
  const stub: MercadoPagoClient = {
    createPreference: () => Promise.reject(new Error('not used')),
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
  beforeEach(() => harness.reset());
  afterAll(async () => {
    delete process.env.PUBLIC_RATE_LIMIT_LIMIT;
    await app?.close();
    await harness.stop();
  });

  // One event with a full pass and an add-on, two competitions, and another event.
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
    const [{ id: venue }] = await client<{ id: string }[]>`
      INSERT INTO venues (organization_id, name) VALUES (${org}, 'Hall') RETURNING id`;
    await client`INSERT INTO event_venues (organization_id, event_id, venue_id)
      VALUES (${org}, ${event.id}, ${venue})`;
    const [breaking, popping] = await client<{ id: string }[]>`
      INSERT INTO activities (event_id, venue_id, kind, name, starts_at, ends_at)
      VALUES (${event.id}, ${venue}, 'battle', 'Breaking 1v1', '2026-11-20T18:00:00Z', '2026-11-20T20:00:00Z'),
        (${event.id}, ${venue}, 'battle', 'Popping 1v1', '2026-11-20T15:00:00Z', '2026-11-20T17:00:00Z')
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
      breaking: breaking.id,
      popping: popping.id,
      full: full.id,
      addOn: addOn.id,
      foreign: foreign.id,
    };
  }

  async function registration(
    eventId: string,
    passes: { passTypeId: string; priceCents: number; activityIds?: string[] }[],
    status: 'pending_payment' | 'confirmed' | 'voided' = 'pending_payment',
  ) {
    const confirmed = status === 'confirmed';
    const [{ id }] = await client<{ id: string }[]>`
      WITH participant AS (
        INSERT INTO participants (full_name, first_name, first_last_name, email, phone)
        VALUES ('Ana López', 'Ana', 'López', ${EMAIL}, ${PHONE}) RETURNING id)
      INSERT INTO event_registrations (event_id, participant_id, status, confirmation_source,
          confirmed_at, folio)
      SELECT ${eventId}, id, ${status}, ${confirmed ? 'approved_payment' : null},
        ${confirmed ? new Date().toISOString() : null}, ${confirmed ? 'LMP-2345' : null}
      FROM participant RETURNING id`;
    for (const pass of passes) {
      const [{ id: passId }] = await client<{ id: string }[]>`
        INSERT INTO event_registration_passes (event_id, event_registration_id, pass_type_id, price_cents)
        VALUES (${eventId}, ${id}, ${pass.passTypeId}, ${pass.priceCents}) RETURNING id`;
      for (const activityId of pass.activityIds ?? [])
        await client`INSERT INTO event_registration_pass_selections (event_id, registration_pass_id, activity_id)
          VALUES (${eventId}, ${passId}, ${activityId})`;
    }
    return id;
  }

  // Records Mercado Pago payments in order; each one is updated a minute after the previous one.
  async function payments(registrationId: string, statuses: string[]) {
    const [{ id: checkout }] = await client<{ id: string }[]>`
      INSERT INTO registration_checkouts (registration_id, mode, preference_id, amount_cents, currency)
      VALUES (${registrationId}, 'sandbox', ${`pref-${registrationId}`}, 150050, 'MXN') RETURNING id`;
    for (const [index, status] of statuses.entries()) {
      const at = new Date(Date.now() - (statuses.length - index) * 60_000).toISOString();
      await client`INSERT INTO registration_payments (checkout_id, provider_payment_id, status,
          amount_cents, currency, created_at, updated_at)
        VALUES (${checkout}, ${`pay-${registrationId}-${index}`}, ${status}, 150050, 'MXN', ${at}, ${at})`;
    }
  }

  const status = (registrationId: string, slug = SLUG) =>
    request(app.getHttpServer()).get(
      `/public/events/${slug}/registrations/${registrationId}/payment-status`,
    );

  it('answers confirmed with folio, passes, selected competitions and total', async () => {
    const ids = await fixture();
    const id = await registration(
      ids.event,
      [
        { passTypeId: ids.full, priceCents: 150050, activityIds: [ids.breaking, ids.popping] },
        { passTypeId: ids.addOn, priceCents: 70000 },
      ],
      'confirmed',
    );
    await payments(id, ['approved']);

    const response = await status(id).expect(200);

    expect(response.body).toEqual({
      status: 'confirmed',
      firstName: 'Ana',
      maskedEmail: 'a***@gmail.com',
      folio: 'LMP-2345',
      passes: [
        { name: 'Pase completo Breaking', competitions: ['Popping 1v1', 'Breaking 1v1'] },
        { name: 'Open Styles', competitions: [] },
      ],
      totalCents: 220050,
    });
    const body = JSON.stringify(response.body);
    expect(body).not.toContain(EMAIL);
    expect(body).not.toContain('López');
    expect(body).not.toContain('1234');
    expect(body).not.toContain('pay-');
    expect(body).not.toContain(id);
  });

  it.each([
    [[], 'confirming'],
    [['approved'], 'confirming'],
    [['pending'], 'pending'],
    [['in_process'], 'pending'],
    [['authorized'], 'pending'],
    [['rejected'], 'rejected'],
    [['cancelled'], 'rejected'],
    [['pending', 'rejected'], 'rejected'],
    [['rejected', 'pending'], 'pending'],
  ])('reads payments %j of a pending registration as %s', async (statuses, expected) => {
    const ids = await fixture();
    const id = await registration(ids.event, [{ passTypeId: ids.full, priceCents: 150050 }]);
    await payments(id, statuses);

    const response = await status(id).expect(200);

    expect(response.body).toMatchObject({ status: expected, folio: null, totalCents: 150050 });
  });

  it('answers unavailable for a voided registration and hides its folio', async () => {
    const ids = await fixture();
    const id = await registration(
      ids.event,
      [{ passTypeId: ids.full, priceCents: 150050 }],
      'confirmed',
    );
    // A voided registration keeps the folio it got on confirmation.
    await client`UPDATE event_registrations
      SET status = 'voided', confirmation_source = NULL, confirmed_at = NULL WHERE id = ${id}`;

    const response = await status(id).expect(200);

    expect(response.body).toMatchObject({ status: 'unavailable', folio: null });
  });

  it('keeps answering after sales close', async () => {
    const ids = await fixture();
    const id = await registration(ids.event, [{ passTypeId: ids.full, priceCents: 150050 }]);
    await client`UPDATE events SET sales_enabled = false WHERE id = ${ids.event}`;

    const response = await status(id).expect(200);

    expect(response.body).toMatchObject({ status: 'confirming' });
  });

  it('answers the same neutral 404 for another event, an unknown registration or slug', async () => {
    const ids = await fixture();
    const foreign = await registration(ids.other, [{ passTypeId: ids.foreign, priceCents: 1000 }]);

    const fromOtherEvent = await status(foreign).expect(404);
    const unknown = await status('11111111-1111-4111-8111-111111111111').expect(404);
    await status(foreign, 'no-such-event').expect(404);

    const notFound = { statusCode: 404, message: 'Registration not found', error: 'Not Found' };
    expect(fromOtherEvent.body).toEqual(notFound);
    expect(unknown.body).toEqual(notFound);
  });

  it('rejects a registration id that is not a uuid', async () => {
    await fixture();

    await status('not-a-uuid').expect(400);
  });
});
