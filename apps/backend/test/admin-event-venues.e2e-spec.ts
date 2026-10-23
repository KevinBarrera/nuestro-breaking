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

const UNKNOWN = '11111111-1111-4111-8111-111111111111';

// Managing an event's venues from the admin panel (#213 T11, D8).
describe('admin event venues (e2e)', () => {
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
  const create = (cookie: string, eventId: string, body: unknown) =>
    server()
      .post(`/admin/events/${eventId}/venues`)
      .set(headers(cookie))
      .send(body as object);
  const edit = (cookie: string, eventId: string, venueId: string, body: unknown) =>
    server()
      .patch(`/admin/events/${eventId}/venues/${venueId}`)
      .set(headers(cookie))
      .send(body as object);
  const listed = async (cookie: string, eventId: string) =>
    (
      (await server().get(`/admin/events/${eventId}/foundation`).set('Cookie', cookie).expect(200))
        .body as { venues: { id: string; name: string }[] }
    ).venues;

  /** Two events of one organization, so a scoped admin of one can be tried against the other. */
  async function fixture() {
    const [{ id: org }] = await client<{ id: string }[]>`
      INSERT INTO organizations (name) VALUES ('Org') RETURNING id`;
    const [event, other] = await client<{ id: string }[]>`
      INSERT INTO events (organization_id, name, time_zone, slug, folio_prefix, starts_at, ends_at)
      VALUES (${org}, 'Los más pesados', 'America/Mexico_City', 'lmp', 'LMP',
          '2026-11-14T16:00:00Z', '2026-11-16T04:00:00Z'),
        (${org}, 'Other', 'Etc/UTC', 'other', 'OTR', NULL, NULL)
      RETURNING id`;
    return { org, event: event.id, other: other.id };
  }
  /** A venue linked to the given events, as the seed creates them. */
  async function linkedVenue(org: string, eventIds: string[], name = 'Foro') {
    const [{ id }] = await client<{ id: string }[]>`
      INSERT INTO venues (organization_id, name) VALUES (${org}, ${name}) RETURNING id`;
    for (const eventId of eventIds)
      await client`INSERT INTO event_venues (organization_id, event_id, venue_id)
        VALUES (${org}, ${eventId}, ${id})`;
    return id;
  }
  const venueRows = () =>
    client<{ id: string; organization_id: string; name: string }[]>`
      SELECT id, organization_id, name FROM venues ORDER BY name`;
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

  it('lets a global admin create a venue linked to the event and audits it', async () => {
    const { org, event } = await fixture();
    const { cookie, userId, sessionId } = await globalAdmin();

    const response = await create(cookie, event, { name: '  Foro Principal ' }).expect(201);

    expect(response.body).toEqual({ id: expect.any(String) as string, name: 'Foro Principal' });
    const venueId = (response.body as { id: string }).id;
    expect(await venueRows()).toEqual([
      { id: venueId, organization_id: org, name: 'Foro Principal' },
    ]);
    expect(await client`SELECT organization_id, event_id, venue_id FROM event_venues`).toEqual([
      { organization_id: org, event_id: event, venue_id: venueId },
    ]);
    expect(await listed(cookie, event)).toEqual([{ id: venueId, name: 'Foro Principal' }]);
    expect(await auditRows()).toEqual([
      {
        event_id: event,
        event_slug: 'lmp',
        event_name: 'Los más pesados',
        action: 'venue_created',
        actor_user_id: userId,
        actor_session_id: sessionId,
        details: { venueId, after: { name: 'Foro Principal' } },
      },
    ]);
  });

  it('lets an admin scoped to the event create, list and edit its venues', async () => {
    const { event } = await fixture();
    const { cookie } = await session('admin', 'event', event);

    const created = await create(cookie, event, { name: 'Foro' }).expect(201);
    const venueId = (created.body as { id: string }).id;
    const edited = await edit(cookie, event, venueId, { name: 'Foro Sur' }).expect(200);

    expect(edited.body).toEqual({ id: venueId, name: 'Foro Sur' });
    expect(await listed(cookie, event)).toEqual([{ id: venueId, name: 'Foro Sur' }]);
    expect((await auditRows()).map((row) => row.action)).toEqual([
      'venue_created',
      'venue_updated',
    ]);
  });

  it('lets a global admin rename a venue, auditing before and after, and skips no-op edits', async () => {
    const { org, event } = await fixture();
    const venueId = await linkedVenue(org, [event]);
    const { cookie, userId, sessionId } = await globalAdmin();

    const response = await edit(cookie, event, venueId, { name: ' Foro Norte ' }).expect(200);
    expect(response.body).toEqual({ id: venueId, name: 'Foro Norte' });
    await edit(cookie, event, venueId, { name: 'Foro Norte' }).expect(200);

    expect(await auditRows()).toEqual([
      {
        event_id: event,
        event_slug: 'lmp',
        event_name: 'Los más pesados',
        action: 'venue_updated',
        actor_user_id: userId,
        actor_session_id: sessionId,
        details: { venueId, before: { name: 'Foro' }, after: { name: 'Foro Norte' } },
      },
    ]);
  });

  it('refuses an admin scoped to another event and judges with an audited denial', async () => {
    const { org, event, other } = await fixture();
    const venueId = await linkedVenue(org, [event]);
    for (const [role, scopeType, scopeId] of [
      ['admin', 'event', other],
      ['judge', 'global', null],
      ['judge', 'event', event],
    ] as const) {
      const { cookie } = await session(role, scopeType, scopeId);
      const before = await denials();
      await create(cookie, event, { name: 'Hijacked' }).expect(401);
      await edit(cookie, event, venueId, { name: 'Hijacked' }).expect(401);
      expect(await denials()).toBe(before + 2);
    }
    expect((await venueRows()).map((row) => row.name)).toEqual(['Foro']);
    expect(await auditRows()).toEqual([]);
  });

  it('refuses a missing Origin, a foreign Origin and a missing CSRF token', async () => {
    const { org, event } = await fixture();
    const venueId = await linkedVenue(org, [event]);
    const { cookie } = await globalAdmin();
    for (const call of [
      () => server().post(`/admin/events/${event}/venues`),
      () => server().patch(`/admin/events/${event}/venues/${venueId}`),
    ]) {
      await call().set('Cookie', cookie).send({ name: 'X' }).expect(403);
      await call()
        .set({ ...headers(cookie), Origin: 'https://evil.example' })
        .send({ name: 'X' })
        .expect(403);
      await call().set({ Cookie: cookie, Origin: trustedOrigin }).send({ name: 'X' }).expect(403);
    }
    expect((await venueRows()).map((row) => row.name)).toEqual(['Foro']);
    expect(await auditRows()).toEqual([]);
  });

  it('answers field errors for invalid input and writes nothing', async () => {
    const { org, event } = await fixture();
    const venueId = await linkedVenue(org, [event]);
    const { cookie } = await globalAdmin();
    const invalid = (fieldErrors: Record<string, string>) => ({
      statusCode: 400,
      message: 'Invalid venue',
      fieldErrors,
    });

    for (const body of [
      {},
      { name: '   ' },
      { name: 'Foro\u0007' },
      { name: 'x'.repeat(121) },
      { name: 7 },
    ])
      expect((await create(cookie, event, body).expect(400)).body).toEqual(
        invalid({ name: 'invalid' }),
      );
    expect((await create(cookie, event, { name: 'Foro', capacity: 300 }).expect(400)).body).toEqual(
      invalid({ capacity: 'invalid' }),
    );
    expect((await edit(cookie, event, venueId, {}).expect(400)).body).toEqual(
      invalid({ body: 'invalid' }),
    );
    expect((await edit(cookie, event, venueId, { name: '' }).expect(400)).body).toEqual(
      invalid({ name: 'invalid' }),
    );
    expect((await venueRows()).map((row) => row.name)).toEqual(['Foro']);
    expect(await auditRows()).toEqual([]);
  });

  it('refuses writes on an archived event', async () => {
    const { org, event } = await fixture();
    const venueId = await linkedVenue(org, [event]);
    await client`UPDATE events SET archived_at = now() WHERE id = ${event}`;
    const { cookie } = await globalAdmin();
    const archived = { statusCode: 409, message: 'Event is archived', code: 'event_archived' };

    expect((await create(cookie, event, { name: 'Nuevo' }).expect(409)).body).toEqual(archived);
    expect((await edit(cookie, event, venueId, { name: 'Nuevo' }).expect(409)).body).toEqual(
      archived,
    );
    expect((await venueRows()).map((row) => row.name)).toEqual(['Foro']);
    expect(await auditRows()).toEqual([]);
  });

  it('answers 404 for an unknown event or a venue not linked to the event', async () => {
    const { org, event, other } = await fixture();
    const elsewhere = await linkedVenue(org, [other], 'Otro foro');
    const { cookie } = await globalAdmin();

    expect((await create(cookie, UNKNOWN, { name: 'Foro' }).expect(404)).body).toMatchObject({
      message: 'Event not found',
    });
    for (const venueId of [elsewhere, UNKNOWN])
      expect((await edit(cookie, event, venueId, { name: 'X' }).expect(404)).body).toEqual({
        statusCode: 404,
        message: 'Venue not found',
        error: 'Not Found',
      });
    expect((await venueRows()).map((row) => row.name)).toEqual(['Otro foro']);
  });

  it('refuses renaming a venue shared with another event', async () => {
    const { org, event, other } = await fixture();
    const venueId = await linkedVenue(org, [event, other]);
    const { cookie } = await globalAdmin();

    const response = await edit(cookie, event, venueId, { name: 'Renamed' }).expect(409);
    expect(response.body).toEqual({
      statusCode: 409,
      message: 'Venue is shared with another event',
      code: 'venue_shared',
    });
    expect((await venueRows()).map((row) => row.name)).toEqual(['Foro']);
    expect(await auditRows()).toEqual([]);
  });

  it('sets up an event without SQL: create the event, add a venue, then add an activity', async () => {
    const { cookie } = await globalAdmin();
    const event = await server()
      .post('/admin/events')
      .set(headers(cookie))
      .send({
        name: 'Los más pesados',
        slug: 'lmp-2026',
        folioPrefix: 'LMP',
        timeZone: 'America/Mexico_City',
        startsAt: '2026-11-14T16:00:00Z',
        endsAt: '2026-11-16T04:00:00Z',
        city: 'Guadalajara',
        state: 'Jalisco',
        country: 'MX',
      })
      .expect(201);
    const eventId = (event.body as { id: string }).id;
    const venue = await create(cookie, eventId, { name: 'Foro Principal' }).expect(201);
    const venueId = (venue.body as { id: string }).id;

    const activity = await server()
      .post(`/admin/events/${eventId}/activities`)
      .set(headers(cookie))
      .send({
        venueId,
        kind: 'competition',
        name: 'Breaking 1v1',
        startsAt: '2026-11-14T18:00:00Z',
        endsAt: '2026-11-14T20:00:00Z',
      })
      .expect(201);
    expect(activity.body).toMatchObject({ eventId, venueId, name: 'Breaking 1v1' });
  });

  it('removes a venue created here when its empty event is deleted', async () => {
    const { event } = await fixture();
    const { cookie } = await globalAdmin();
    const venue = await create(cookie, event, { name: 'Foro' }).expect(201);
    const venueId = (venue.body as { id: string }).id;

    await server()
      .delete(`/admin/events/${event}`)
      .set(headers(cookie))
      .send({ confirmSlug: 'lmp' })
      .expect(204);

    expect(await venueRows()).toEqual([]);
    expect((await auditRows()).map((row) => row.action)).toEqual(['venue_created', 'deleted']);
    expect((await auditRows())[1]).toMatchObject({ details: { venues: [venueId] } });
  });
});
