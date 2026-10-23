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

// Editing an event from the admin panel (#213 T3).
describe('admin event editing (e2e)', () => {
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
  const edit = (cookie: string, eventId: string, body: unknown) =>
    server()
      .patch(`/admin/events/${eventId}`)
      .set(headers(cookie))
      .send(body as object);

  /** Two events, so a scoped admin of one can be tried against the other. */
  async function fixture() {
    const [{ id: org }] = await client<{ id: string }[]>`
      INSERT INTO organizations (name) VALUES ('Org') RETURNING id`;
    const [event, other] = await client<{ id: string }[]>`
      INSERT INTO events (organization_id, name, time_zone, slug, folio_prefix, starts_at, ends_at)
      VALUES (${org}, 'Los más pesados', 'America/Mexico_City', 'lmp', 'LMP',
          '2026-11-14T16:00:00Z', '2026-11-16T04:00:00Z'),
        (${org}, 'Other', 'Etc/UTC', 'other', 'OTR', NULL, NULL)
      RETURNING id`;
    return { event: event.id, other: other.id };
  }
  const stored = async (id: string) =>
    (
      await client<Record<string, unknown>[]>`
        SELECT name, slug, folio_prefix, time_zone, starts_at, ends_at FROM events WHERE id = ${id}`
    )[0];
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

  it('lets a global admin edit name, time zone and dates and audits the changed fields', async () => {
    const { event } = await fixture();
    const { cookie, userId, sessionId } = await globalAdmin();

    const response = await edit(cookie, event, {
      name: '  Los más pesados 2026 ',
      timeZone: 'america/bogota',
      startsAt: '2026-11-14T10:00:00-05:00',
      endsAt: '2026-11-16T04:00:00Z',
    }).expect(200);

    expect(response.body).toEqual({
      id: event,
      name: 'Los más pesados 2026',
      slug: 'lmp',
      folioPrefix: 'LMP',
      timeZone: 'America/Bogota',
      startsAt: '2026-11-14T15:00:00.000Z',
      endsAt: '2026-11-16T04:00:00.000Z',
      salesEnabled: false,
      archivedAt: null,
      city: null,
      state: null,
      country: null,
    });
    expect(await auditRows()).toEqual([
      {
        event_id: event,
        event_slug: 'lmp',
        event_name: 'Los más pesados 2026',
        action: 'updated',
        actor_user_id: userId,
        actor_session_id: sessionId,
        // The end date was sent unchanged, so it is left out.
        details: {
          before: {
            name: 'Los más pesados',
            timeZone: 'America/Mexico_City',
            startsAt: '2026-11-14T16:00:00.000Z',
          },
          after: {
            name: 'Los más pesados 2026',
            timeZone: 'America/Bogota',
            startsAt: '2026-11-14T15:00:00.000Z',
          },
        },
      },
    ]);
  });

  it('fills in the location of an event created without one, then edits a single field', async () => {
    const { event } = await fixture();
    const { cookie } = await globalAdmin();

    const filled = await edit(cookie, event, {
      city: ' Guadalajara ',
      state: 'Jalisco',
      country: 'mx',
    }).expect(200);
    expect(filled.body).toMatchObject({ city: 'Guadalajara', state: 'Jalisco', country: 'MX' });

    await edit(cookie, event, { city: 'Zapopan' }).expect(200);
    const [row] = await client<Record<string, unknown>[]>`
      SELECT city, state, country FROM events WHERE id = ${event}`;
    expect(row).toEqual({ city: 'Zapopan', state: 'Jalisco', country: 'MX' });
    expect((await auditRows()).at(-1)?.details).toEqual({
      before: { city: 'Guadalajara' },
      after: { city: 'Zapopan' },
    });
  });

  it('refuses part of a location for an event without one and keeps the event unchanged', async () => {
    const { event } = await fixture();
    const { cookie } = await globalAdmin();

    const response = await edit(cookie, event, { city: 'Guadalajara' }).expect(400);

    expect(response.body).toEqual({
      statusCode: 400,
      message: 'Invalid event',
      fieldErrors: { state: 'invalid', country: 'invalid' },
    });
    const [row] = await client<Record<string, unknown>[]>`
      SELECT city, state, country FROM events WHERE id = ${event}`;
    expect(row).toEqual({ city: null, state: null, country: null });
    expect(await auditRows()).toEqual([]);
  });

  it('lets an admin scoped to the event edit it', async () => {
    const { event } = await fixture();
    const { cookie } = await session('admin', 'event', event);
    const response = await edit(cookie, event, { name: 'Renamed' }).expect(200);
    expect(response.body).toMatchObject({ id: event, name: 'Renamed' });
    expect((await stored(event)).name).toBe('Renamed');
  });

  it('refuses an admin scoped to another event and judges with an audited denial', async () => {
    const { event, other } = await fixture();
    for (const [role, scopeType, scopeId] of [
      ['admin', 'event', other],
      ['judge', 'global', null],
      ['judge', 'event', event],
    ] as const) {
      const { cookie } = await session(role, scopeType, scopeId);
      const before = await denials();
      await edit(cookie, event, { name: 'Hijacked' }).expect(401);
      expect(await denials()).toBe(before + 1);
    }
    expect((await stored(event)).name).toBe('Los más pesados');
    expect(await auditRows()).toEqual([]);
  });

  it('refuses a missing Origin, a foreign Origin and a missing CSRF token', async () => {
    const { event } = await fixture();
    const { cookie } = await globalAdmin();
    const path = `/admin/events/${event}`;
    await server().patch(path).set('Cookie', cookie).send({ name: 'X' }).expect(403);
    await server()
      .patch(path)
      .set({ ...headers(cookie), Origin: 'https://evil.example' })
      .send({ name: 'X' })
      .expect(403);
    await server()
      .patch(path)
      .set({ Cookie: cookie, Origin: trustedOrigin })
      .send({ name: 'X' })
      .expect(403);
    expect((await stored(event)).name).toBe('Los más pesados');
  });

  it('refuses slug and folio prefix changes as immutable and leaves the event unchanged', async () => {
    const { event } = await fixture();
    const { cookie } = await globalAdmin();
    const before = await stored(event);

    const response = await edit(cookie, event, {
      name: 'Renamed',
      slug: 'new-slug',
      folioPrefix: 'NEW',
      color: 'red',
    }).expect(400);

    expect(response.body).toEqual({
      statusCode: 400,
      message: 'Invalid event',
      fieldErrors: { slug: 'immutable', folioPrefix: 'immutable', color: 'invalid' },
    });
    expect(await stored(event)).toEqual(before);
    expect(await auditRows()).toEqual([]);
  });

  it('merges a single date with the stored one and refuses an invalid merged window', async () => {
    const { event, other } = await fixture();
    const { cookie } = await globalAdmin();

    // The stored start is 2026-11-14T16:00Z, so an end before it is refused.
    const early = await edit(cookie, event, { endsAt: '2026-11-14T15:00:00Z' }).expect(400);
    expect(early.body).toEqual({
      statusCode: 400,
      message: 'Invalid event',
      fieldErrors: { endsAt: 'invalid' },
    });
    // The other event has no dates, so a start alone has no end to pair with.
    const unpaired = await edit(cookie, other, { startsAt: '2026-11-14T15:00:00Z' }).expect(400);
    expect(unpaired.body).toMatchObject({ fieldErrors: { endsAt: 'invalid' } });

    const moved = await edit(cookie, event, { endsAt: '2026-11-17T04:00:00Z' }).expect(200);
    expect(moved.body).toMatchObject({
      startsAt: '2026-11-14T16:00:00.000Z',
      endsAt: '2026-11-17T04:00:00.000Z',
    });
    const cleared = await edit(cookie, event, { startsAt: null, endsAt: null }).expect(200);
    expect(cleared.body).toMatchObject({ startsAt: null, endsAt: null });
    expect((await auditRows()).map((row) => row.action)).toEqual(['updated', 'updated']);
  });

  it('refuses an unknown time zone and an empty body', async () => {
    const { event } = await fixture();
    const { cookie } = await globalAdmin();
    const zone = await edit(cookie, event, { timeZone: 'Mars/Olympus' }).expect(400);
    expect(zone.body).toMatchObject({ fieldErrors: { timeZone: 'invalid' } });
    const empty = await edit(cookie, event, {}).expect(400);
    expect(empty.body).toMatchObject({ fieldErrors: { body: 'invalid' } });
    expect((await stored(event)).time_zone).toBe('America/Mexico_City');
  });

  it('answers 200 without an audit row when nothing changes', async () => {
    const { event } = await fixture();
    const { cookie } = await globalAdmin();
    const response = await edit(cookie, event, {
      name: 'Los más pesados',
      endsAt: '2026-11-15T22:00:00-06:00',
    }).expect(200);
    expect(response.body).toMatchObject({ name: 'Los más pesados' });
    expect(await auditRows()).toEqual([]);
  });

  it('answers 404 for an unknown event', async () => {
    const { cookie } = await globalAdmin();
    const response = await edit(cookie, '11111111-1111-4111-8111-111111111111', {
      name: 'X',
    }).expect(404);
    expect(response.body).toEqual({
      statusCode: 404,
      message: 'Event not found',
      error: 'Not Found',
    });
  });

  it('refuses editing an archived event and leaves it unchanged', async () => {
    const { event } = await fixture();
    await client`UPDATE events SET archived_at = now() WHERE id = ${event}`;
    const { cookie } = await globalAdmin();
    const response = await edit(cookie, event, { name: 'Renamed' }).expect(409);
    expect(response.body).toEqual({
      statusCode: 409,
      message: 'Event is archived',
      code: 'event_archived',
    });
    expect((await stored(event)).name).toBe('Los más pesados');
    expect(await auditRows()).toEqual([]);
  });
});
