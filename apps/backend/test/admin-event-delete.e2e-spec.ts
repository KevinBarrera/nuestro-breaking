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

const SLUG = 'lmp';
const UNKNOWN_EVENT = '11111111-1111-4111-8111-111111111111';

// Deleting empty events from the admin panel (#213 T5, D7).
describe('admin event delete (e2e)', () => {
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
  beforeEach(() => harness.reset());
  afterAll(async () => {
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
  // The foundation read tells Datos del evento up front whether the event can be deleted.
  const foundationBlockers = async (cookie: string, eventId: string) =>
    (
      (await server().get(`/admin/events/${eventId}/foundation`).set(headers(cookie)).expect(200))
        .body as { deleteBlockers: string[] }
    ).deleteBlockers;
  const remove = (cookie: string, eventId: string, body: unknown = { confirmSlug: SLUG }) =>
    server()
      .delete(`/admin/events/${eventId}`)
      .set(headers(cookie))
      .send(body as object);

  /** An empty event: one venue link (setup only) and nothing sold, scheduled or audited. */
  async function fixture() {
    const [{ id: org }] = await client<{ id: string }[]>`
      INSERT INTO organizations (name) VALUES ('Org') RETURNING id`;
    const [{ id: event }] = await client<{ id: string }[]>`
      INSERT INTO events (organization_id, name, time_zone, slug, folio_prefix, starts_at, ends_at)
      VALUES (${org}, 'Los más pesados', 'America/Mexico_City', ${SLUG}, 'LMP',
          '2026-11-20T00:00:00Z', '2026-11-22T00:00:00Z')
      RETURNING id`;
    const [{ id: venue }] = await client<{ id: string }[]>`
      INSERT INTO venues (organization_id, name) VALUES (${org}, 'Foro') RETURNING id`;
    await client`INSERT INTO event_venues (organization_id, event_id, venue_id)
      VALUES (${org}, ${event}, ${venue})`;
    return { org, event, venue };
  }
  const count = async (query: Promise<{ n: string }[]>) => Number((await query)[0].n);
  const eventCount = (id: string) =>
    count(client<{ n: string }[]>`SELECT count(*) AS n FROM events WHERE id = ${id}`);
  const auditRows = () =>
    client<Record<string, unknown>[]>`
      SELECT event_id, event_slug, event_name, action, actor_user_id, actor_session_id, details
      FROM event_admin_audit ORDER BY created_at`;
  const denials = () =>
    count(client<{ n: string }[]>`SELECT count(*) AS n FROM auth_audit WHERE action = 'denied'`);

  it('deletes an empty event with its venue and event roles, audits it and frees the slug', async () => {
    const ids = await fixture();
    const { cookie, userId, sessionId } = await globalAdmin();
    const scoped = await session('admin', 'event', ids.event);
    const [{ id: otherEvent }] = await client<{ id: string }[]>`
      INSERT INTO events (organization_id, name, time_zone, slug, folio_prefix)
      VALUES (${ids.org}, 'Otro', 'UTC', 'otro', 'OTR') RETURNING id`;
    const otherRole = await session('judge', 'event', otherEvent);
    expect(await foundationBlockers(cookie, ids.event)).toEqual([]);

    const response = await remove(cookie, ids.event).expect(204);

    expect(response.body).toEqual({});
    expect(await eventCount(ids.event)).toBe(0);
    expect(
      await count(client<{ n: string }[]>`
        SELECT count(*) AS n FROM event_venues WHERE event_id = ${ids.event}`),
    ).toBe(0);
    expect(
      await count(
        client<{ n: string }[]>`SELECT count(*) AS n FROM venues WHERE id = ${ids.venue}`,
      ),
    ).toBe(0);
    expect(
      await count(client<{ n: string }[]>`
        SELECT count(*) AS n FROM user_roles WHERE user_id = ${scoped.userId}`),
    ).toBe(0);
    // Other events' roles and the caller's global role are untouched.
    expect(
      await count(client<{ n: string }[]>`
        SELECT count(*) AS n FROM user_roles WHERE user_id IN (${otherRole.userId}, ${userId})`),
    ).toBe(2);
    expect(await auditRows()).toEqual([
      {
        event_id: ids.event,
        event_slug: SLUG,
        event_name: 'Los más pesados',
        action: 'deleted',
        actor_user_id: userId,
        actor_session_id: sessionId,
        details: {
          folioPrefix: 'LMP',
          archivedAt: null,
          venues: [ids.venue],
          eventRoles: [{ userId: scoped.userId, role: 'admin' }],
        },
      },
    ]);

    await server()
      .post('/admin/events')
      .set(headers(cookie))
      .send({ name: 'De nuevo', slug: SLUG, folioPrefix: 'LMP', timeZone: 'UTC' })
      .expect(201);
  });

  it('keeps a venue another event still uses', async () => {
    const ids = await fixture();
    const { cookie } = await globalAdmin();
    const [{ id: otherEvent }] = await client<{ id: string }[]>`
      INSERT INTO events (organization_id, name, time_zone, slug, folio_prefix)
      VALUES (${ids.org}, 'Otro', 'UTC', 'otro', 'OTR') RETURNING id`;
    await client`INSERT INTO event_venues (organization_id, event_id, venue_id)
      VALUES (${ids.org}, ${otherEvent}, ${ids.venue})`;

    await remove(cookie, ids.event).expect(204);

    expect(
      await count(
        client<{ n: string }[]>`SELECT count(*) AS n FROM venues WHERE id = ${ids.venue}`,
      ),
    ).toBe(1);
    expect((await auditRows())[0]).toMatchObject({ details: { venues: [] } });
  });

  it('deletes an archived empty event', async () => {
    const ids = await fixture();
    await client`UPDATE events SET archived_at = now() WHERE id = ${ids.event}`;
    const { cookie } = await globalAdmin();

    await remove(cookie, ids.event).expect(204);

    expect(await eventCount(ids.event)).toBe(0);
    expect((await auditRows())[0]).toMatchObject({
      action: 'deleted',
      details: { archivedAt: expect.any(String) as string },
    });
  });

  describe('refuses an event that is not empty', () => {
    const blockers: [string, (ids: { event: string; venue: string }) => Promise<unknown>][] = [
      [
        'activities',
        ({ event, venue }) => client`
          INSERT INTO activities (event_id, venue_id, kind, name, starts_at, ends_at)
          VALUES (${event}, ${venue}, 'battle', 'Breaking 1v1', '2026-11-20T18:00:00Z',
            '2026-11-20T20:00:00Z')`,
      ],
      [
        'passTypes',
        ({ event }) => client`
          INSERT INTO event_pass_types (event_id, name, pass_class, price_cents, status)
          VALUES (${event}, 'Entrada general', 'general', 100000, 'archived')`,
      ],
      ['registrations', ({ event }) => registration(event, 'pending_payment')],
      [
        'checkIns',
        async ({ event }) => {
          const registrationId = await registration(event, 'confirmed');
          const { userId, sessionId } = await globalAdmin();
          await client`
            INSERT INTO event_check_ins (event_id, event_registration_id, actor_user_id, session_id)
            VALUES (${event}, ${registrationId}, ${userId}, ${sessionId})`;
        },
      ],
      [
        'catalogAudit',
        async ({ event }) => {
          const { userId, sessionId } = await globalAdmin();
          await client`
            INSERT INTO event_catalog_audit (event_id, actor_user_id, actor_session_id, entity_type,
              entity_id, operation, before, after)
            VALUES (${event}, ${userId}, ${sessionId}, 'pass_type', ${UNKNOWN_EVENT}, 'create',
              NULL, '{}'::jsonb)`;
        },
      ],
      [
        'registrationAudit',
        async ({ event }) => {
          const registrationId = await registration(event, 'pending_payment');
          await client`
            INSERT INTO registration_operation_audit (operation_type, actor_kind, event_id,
              registration_id, participant_id, before_state, after_state)
            SELECT 'online_registration', 'public', event_id, id, participant_id, '{}'::jsonb,
              '{}'::jsonb
            FROM event_registrations WHERE id = ${registrationId}`;
        },
      ],
    ];

    async function registration(event: string, status: string) {
      const [{ id }] = await client<{ id: string }[]>`
        WITH participant AS (INSERT INTO participants (full_name) VALUES ('Buyer') RETURNING id)
        INSERT INTO event_registrations (event_id, participant_id, status, confirmation_source,
          confirmed_at)
        SELECT ${event}, id, ${status},
          CASE WHEN ${status} = 'confirmed' THEN 'admin_cash' END,
          CASE WHEN ${status} = 'confirmed' THEN now() END
        FROM participant RETURNING id`;
      return id;
    }

    it.each(blockers)('with %s', async (kind, seed) => {
      const ids = await fixture();
      await seed(ids);
      const { cookie } = await globalAdmin();
      expect(await foundationBlockers(cookie, ids.event)).toEqual(expect.arrayContaining([kind]));

      const response = await remove(cookie, ids.event).expect(409);

      expect(response.body).toEqual({
        statusCode: 409,
        message: 'Event is not empty',
        code: 'event_not_empty',
        blockers: expect.arrayContaining([kind]) as string[],
      });
      expect(await eventCount(ids.event)).toBe(1);
      expect(
        await count(client<{ n: string }[]>`
          SELECT count(*) AS n FROM event_venues WHERE event_id = ${ids.event}`),
      ).toBe(1);
      expect(await auditRows()).toEqual([]);
    });

    it('lists every blocker present, in a fixed order', async () => {
      const ids = await fixture();
      for (const [, seed] of [...blockers].reverse()) await seed(ids);
      const { cookie } = await globalAdmin();
      const all = [
        'activities',
        'passTypes',
        'registrations',
        'checkIns',
        'catalogAudit',
        'registrationAudit',
      ];
      expect(await foundationBlockers(cookie, ids.event)).toEqual(all);

      const response = await remove(cookie, ids.event).expect(409);

      expect((response.body as { blockers: string[] }).blockers).toEqual(all);
      expect(await eventCount(ids.event)).toBe(1);
    });
  });

  it('refuses a missing or wrong slug confirmation and deletes nothing', async () => {
    const ids = await fixture();
    const { cookie } = await globalAdmin();
    for (const body of [
      {},
      { confirmSlug: 'LMP' },
      { confirmSlug: ` ${SLUG}` },
      { confirmSlug: 7 },
    ]) {
      const response = await remove(cookie, ids.event, body).expect(400);
      expect(response.body).toEqual({
        statusCode: 400,
        message: 'Invalid event',
        fieldErrors: { confirmSlug: 'invalid' },
      });
    }
    expect(await eventCount(ids.event)).toBe(1);
    expect(await auditRows()).toEqual([]);
  });

  it('answers 404 for an unknown event', async () => {
    const { cookie } = await globalAdmin();
    const response = await remove(cookie, UNKNOWN_EVENT).expect(404);
    expect(response.body).toEqual({
      statusCode: 404,
      message: 'Event not found',
      error: 'Not Found',
    });
  });

  it('refuses event-scoped admins and judges with an audited denial', async () => {
    const ids = await fixture();
    for (const [role, scopeType, scopeId] of [
      ['admin', 'event', ids.event],
      ['judge', 'global', null],
      ['judge', 'event', ids.event],
    ] as const) {
      const { cookie } = await session(role, scopeType, scopeId);
      const before = await denials();
      await remove(cookie, ids.event).expect(401);
      expect(await denials()).toBe(before + 1);
    }
    expect(await eventCount(ids.event)).toBe(1);
    expect(await auditRows()).toEqual([]);
  });

  it('refuses a missing Origin, a foreign Origin and a missing CSRF token', async () => {
    const ids = await fixture();
    const { cookie } = await globalAdmin();
    const path = `/admin/events/${ids.event}`;
    const body = { confirmSlug: SLUG };
    await server().delete(path).set('Cookie', cookie).send(body).expect(403);
    await server()
      .delete(path)
      .set({ ...headers(cookie), Origin: 'https://evil.example' })
      .send(body)
      .expect(403);
    await server()
      .delete(path)
      .set({ Cookie: cookie, Origin: trustedOrigin })
      .send(body)
      .expect(403);
    expect(await eventCount(ids.event)).toBe(1);
    expect(await auditRows()).toEqual([]);
  });
});
