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
import type { AdminEvent } from '@/events/admin-events/admin-event.read-model';
import { LEGAL_DOCUMENT_VERSIONS } from '@/events/legal-documents';
import { readTrustedOrigin } from '@/http';
import { MercadoPagoClient } from '@/payments';
import { PostgresHarness } from './support/postgres-harness';

jest.setTimeout(120_000);

const DAY = 24 * 60 * 60 * 1000;
const SLUG = 'lmp';
const UNKNOWN_EVENT = '11111111-1111-4111-8111-111111111111';

// Archiving and restoring events from the admin panel (#213 T4, D6).
describe('admin event archive and restore (e2e)', () => {
  const harness = new PostgresHarness();
  let client: Sql;
  let app: INestApplication<App>;
  const providerCalls: string[] = [];
  const stub: MercadoPagoClient = {
    createPreference: () => {
      providerCalls.push('createPreference');
      return Promise.reject(new Error('not used'));
    },
    searchPayments: () => Promise.resolve([]),
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
    app = moduleRef.createNestApplication();
    await app.init();
  });
  beforeEach(async () => {
    providerCalls.length = 0;
    await harness.reset();
  });
  afterAll(async () => {
    delete process.env.PUBLIC_RATE_LIMIT_LIMIT;
    await app?.close();
    await harness.stop();
  });

  async function session(role: string, scopeType: string, scopeId: string | null = null) {
    const [{ id: userId }] = await client<{ id: string }[]>`
      INSERT INTO users (email, display_name, active)
      VALUES (${randomBytes(8).toString('hex') + '@example.com'}, 'Operator', true) RETURNING id`;
    await client`INSERT INTO user_roles (user_id, role, scope_type, scope_id)
      VALUES (${userId}, ${role}, ${scopeType}, ${scopeId})`;
    const token = randomBytes(32).toString('hex');
    const [{ id: sessionId }] = await client<{ id: string }[]>`
      INSERT INTO auth_sessions (user_id, token_digest, expires_at)
      VALUES (${userId}, ${createHash('sha256').update(token).digest('hex')}, now() + interval '1 hour')
      RETURNING id`;
    return { cookie: `nb_admin_session=${token}`, userId, sessionId };
  }
  const globalAdmin = () => session('admin', 'global');

  const trustedOrigin = readTrustedOrigin(process.env);
  const headers = (cookie: string) => ({
    Cookie: cookie,
    Origin: trustedOrigin,
    'X-CSRF-Token': createHash('sha256')
      .update(`nb-admin-csrf-v1:${cookie.slice('nb_admin_session='.length)}`)
      .digest('hex'),
  });
  const server = () => request(app.getHttpServer());
  const archive = (cookie: string, eventId: string) =>
    server().post(`/admin/events/${eventId}/archive`).set(headers(cookie));
  const restore = (cookie: string, eventId: string) =>
    server().post(`/admin/events/${eventId}/restore`).set(headers(cookie));
  const list = (cookie: string, query = '') =>
    server().get(`/admin/events${query}`).set('Cookie', cookie);

  const opensAt = new Date(Date.now() - DAY).toISOString();
  const closesAt = new Date(Date.now() + 30 * DAY).toISOString();

  /** An event on sale with one pass type and one registration waiting for payment. */
  async function fixture() {
    const [{ id: org }] = await client<{ id: string }[]>`
      INSERT INTO organizations (name) VALUES ('Org') RETURNING id`;
    const [{ id: event }] = await client<{ id: string }[]>`
      INSERT INTO events (organization_id, name, time_zone, slug, folio_prefix, sales_enabled,
          sales_opens_at, sales_closes_at)
      VALUES (${org}, 'Los más pesados', 'America/Mexico_City', ${SLUG}, 'LMP', true,
          ${opensAt}, ${closesAt})
      RETURNING id`;
    const [{ id: passType }] = await client<{ id: string }[]>`
      INSERT INTO event_pass_types (event_id, name, pass_class, price_cents, requires_pass_class, status)
      VALUES (${event}, 'Entrada general', 'general', 100000, NULL, 'active') RETURNING id`;
    const [{ id: registration }] = await client<{ id: string }[]>`
      WITH participant AS (INSERT INTO participants (full_name) VALUES ('Buyer') RETURNING id)
      INSERT INTO event_registrations (event_id, participant_id, status)
      SELECT ${event}, id, 'pending_payment' FROM participant RETURNING id`;
    await client`INSERT INTO event_registration_passes (event_id, event_registration_id, pass_type_id, price_cents)
      VALUES (${event}, ${registration}, ${passType}, 100000)`;
    return { event, passType, registration };
  }
  const stored = async (id: string) => {
    const [row] = await client<
      {
        archived: boolean;
        sales_enabled: boolean;
        sales_opens_at: string | null;
        sales_closes_at: string | null;
      }[]
    >`
      SELECT archived_at IS NOT NULL AS archived, sales_enabled, sales_opens_at, sales_closes_at
      FROM events WHERE id = ${id}`;
    // The raw client returns timestamps as text.
    const date = (value: string | null) => (value === null ? null : new Date(value));
    return {
      ...row,
      sales_opens_at: date(row.sales_opens_at),
      sales_closes_at: date(row.sales_closes_at),
    };
  };
  const auditRows = () =>
    client<Record<string, unknown>[]>`
      SELECT event_id, event_slug, event_name, action, actor_user_id, actor_session_id, details
      FROM event_admin_audit ORDER BY created_at`;
  const denials = async () =>
    Number(
      (
        await client<{ n: string }[]>`SELECT count(*) AS n FROM auth_audit WHERE action = 'denied'`
      )[0].n,
    );

  const publicCatalog = (slug = SLUG) => server().get(`/public/events/${slug}/catalog`);
  const publicRegister = (passTypeId: string, slug = SLUG) =>
    server()
      .post(`/public/events/${slug}/registrations`)
      .send({
        buyer: {
          firstName: 'Ana',
          firstLastName: 'López',
          secondLastName: 'García',
          stageName: 'B-Girl Ana',
          email: 'ana@example.com',
          phone: '55 1234 5678',
          city: 'Ciudad de México',
          instagram: '@ana',
          level: 'Intermedio',
          birthDate: '2000-02-29',
        },
        passes: [{ passTypeId }],
        legalAcceptances: LEGAL_DOCUMENT_VERSIONS,
      });
  const publicCheckout = (registrationId: string, slug = SLUG) =>
    server().post(`/public/events/${slug}/registrations/${registrationId}/checkout`);
  const paymentStatus = (registrationId: string) =>
    server().get(`/public/events/${SLUG}/registrations/${registrationId}/payment-status`);

  it('archives an event: sales close, public reads 404 like an unknown slug, payment status works', async () => {
    const ids = await fixture();
    const { cookie, userId, sessionId } = await globalAdmin();
    await publicCatalog().expect(200);

    const response = await archive(cookie, ids.event).expect(201);

    const event = response.body as AdminEvent;
    expect(event).toMatchObject({ id: ids.event, slug: SLUG, salesEnabled: false });
    expect(new Date(event.archivedAt ?? '').getTime()).toBeGreaterThan(Date.now() - 60_000);
    // The sales window is kept, so restoring and reopening sales starts from the same dates.
    expect(await stored(ids.event)).toEqual({
      archived: true,
      sales_enabled: false,
      sales_opens_at: new Date(opensAt),
      sales_closes_at: new Date(closesAt),
    });
    expect(await auditRows()).toEqual([
      {
        event_id: ids.event,
        event_slug: SLUG,
        event_name: 'Los más pesados',
        action: 'archived',
        actor_user_id: userId,
        actor_session_id: sessionId,
        details: { salesEnabled: true },
      },
    ]);

    const unknownCatalog = await publicCatalog('no-such-event').expect(404);
    expect((await publicCatalog().expect(404)).body).toEqual(unknownCatalog.body);
    const unknownRegister = await publicRegister(ids.passType, 'no-such-event').expect(404);
    expect((await publicRegister(ids.passType).expect(404)).body).toEqual(unknownRegister.body);
    const unknownCheckout = await publicCheckout(ids.registration, 'no-such-event').expect(404);
    expect((await publicCheckout(ids.registration).expect(404)).body).toEqual(unknownCheckout.body);
    expect(providerCalls).toEqual([]);
    await paymentStatus(ids.registration).expect(200);
  });

  it('moves the event out of the default admin list and into the archived one', async () => {
    const ids = await fixture();
    const { cookie } = await globalAdmin();
    await archive(cookie, ids.event).expect(201);

    expect((await list(cookie).expect(200)).body).toEqual([]);
    expect((await list(cookie, '?archived=true').expect(200)).body).toEqual([
      expect.objectContaining({ id: ids.event, archivedAt: expect.any(String) as string }),
    ]);
  });

  it('restores an archived event with sales still closed and audits it', async () => {
    const ids = await fixture();
    const { cookie, userId, sessionId } = await globalAdmin();
    const archived = (await archive(cookie, ids.event).expect(201)).body as AdminEvent;

    const response = await restore(cookie, ids.event).expect(201);

    expect(response.body).toMatchObject({ id: ids.event, archivedAt: null, salesEnabled: false });
    expect(await stored(ids.event)).toMatchObject({ archived: false, sales_enabled: false });
    expect((await auditRows())[1]).toEqual({
      event_id: ids.event,
      event_slug: SLUG,
      event_name: 'Los más pesados',
      action: 'restored',
      actor_user_id: userId,
      actor_session_id: sessionId,
      details: { archivedAt: archived.archivedAt },
    });
    expect((await list(cookie).expect(200)).body).toEqual([
      expect.objectContaining({ id: ids.event, archivedAt: null }),
    ]);
    const catalog = await publicCatalog().expect(200);
    expect(catalog.body).toMatchObject({ sales: { state: 'closed' } });
    await publicRegister(ids.passType).expect(409);
  });

  it('refuses archiving an archived event and restoring an active one', async () => {
    const ids = await fixture();
    const { cookie } = await globalAdmin();

    const notArchived = await restore(cookie, ids.event).expect(409);
    expect(notArchived.body).toEqual({
      statusCode: 409,
      message: 'Event is not archived',
      code: 'event_not_archived',
    });
    await archive(cookie, ids.event).expect(201);
    const twice = await archive(cookie, ids.event).expect(409);
    expect(twice.body).toEqual({
      statusCode: 409,
      message: 'Event is archived',
      code: 'event_archived',
    });
    expect((await auditRows()).map((row) => row.action)).toEqual(['archived']);
  });

  it('answers 404 for an unknown event', async () => {
    const { cookie } = await globalAdmin();
    for (const call of [archive, restore]) {
      const response = await call(cookie, UNKNOWN_EVENT).expect(404);
      expect(response.body).toEqual({
        statusCode: 404,
        message: 'Event not found',
        error: 'Not Found',
      });
    }
  });

  it('refuses event-scoped admins and judges with an audited denial', async () => {
    const ids = await fixture();
    await client`UPDATE events SET archived_at = now(), sales_enabled = false WHERE id = ${ids.event}`;
    for (const [role, scopeType, scopeId] of [
      ['admin', 'event', ids.event],
      ['judge', 'global', null],
      ['judge', 'event', ids.event],
    ] as const) {
      const { cookie } = await session(role, scopeType, scopeId);
      for (const call of [restore, archive]) {
        const before = await denials();
        await call(cookie, ids.event).expect(401);
        expect(await denials()).toBe(before + 1);
      }
    }
    expect(await stored(ids.event)).toMatchObject({ archived: true });
    expect(await auditRows()).toEqual([]);
  });

  it('refuses a missing Origin, a foreign Origin and a missing CSRF token', async () => {
    const ids = await fixture();
    const { cookie } = await globalAdmin();
    for (const action of ['archive', 'restore']) {
      const path = `/admin/events/${ids.event}/${action}`;
      await server().post(path).set('Cookie', cookie).expect(403);
      await server()
        .post(path)
        .set({ ...headers(cookie), Origin: 'https://evil.example' })
        .expect(403);
      await server().post(path).set({ Cookie: cookie, Origin: trustedOrigin }).expect(403);
    }
    expect(await stored(ids.event)).toMatchObject({ archived: false, sales_enabled: true });
    expect(await auditRows()).toEqual([]);
  });

  it('refuses turning sales on for an archived event but still saves them off', async () => {
    const ids = await fixture();
    const { cookie } = await globalAdmin();
    await archive(cookie, ids.event).expect(201);
    const sales = (salesEnabled: boolean) =>
      server()
        .put(`/admin/events/${ids.event}/sales`)
        .set(headers(cookie))
        .send({ salesEnabled, salesOpensAt: null, salesClosesAt: null });

    const refused = await sales(true).expect(409);
    expect(refused.body).toEqual({
      statusCode: 409,
      message: 'Event is archived',
      code: 'event_archived',
    });
    expect(await stored(ids.event)).toMatchObject({
      sales_enabled: false,
      sales_opens_at: new Date(opensAt),
    });
    await sales(false).expect(200);
    expect(await stored(ids.event)).toMatchObject({ sales_enabled: false, sales_opens_at: null });
  });
});
