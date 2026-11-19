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
import { DEFAULT_ORGANIZATION_NAME } from '@/events/admin-events/event-organization';
import { readTrustedOrigin } from '@/http';
import { PostgresHarness } from './support/postgres-harness';

jest.setTimeout(120_000);

// Creating events from the admin panel and reading them back (#213 T2).
describe('admin event creation and read model (e2e)', () => {
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

  const valid = {
    name: 'Los más pesados 2026',
    slug: 'los-mas-pesados-2026',
    folioPrefix: 'LMP',
    timeZone: 'America/Mexico_City',
    startsAt: '2026-11-14T10:00:00-06:00',
    endsAt: '2026-11-15T22:00:00-06:00',
    city: 'Guadalajara',
    state: 'Jalisco',
    country: 'MX',
  };

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
  const created = (response: { body: unknown }) => response.body as AdminEvent;
  const create = (cookie: string, body: unknown) =>
    server()
      .post('/admin/events')
      .set(headers(cookie))
      .send(body as object);

  async function organization(name = 'Org') {
    const [{ id }] = await client<{ id: string }[]>`
      INSERT INTO organizations (name) VALUES (${name}) RETURNING id`;
    return id;
  }
  const count = async (table: 'events' | 'event_admin_audit' | 'organizations') =>
    Number((await client<{ n: string }[]>`SELECT count(*) AS n FROM ${client(table)}`)[0].n);
  const denials = async () =>
    Number(
      (
        await client<{ n: string }[]>`SELECT count(*) AS n FROM auth_audit WHERE action = 'denied'`
      )[0].n,
    );

  it('creates the first event of an empty database with its organization, sales off, and audit', async () => {
    const { cookie, userId, sessionId } = await globalAdmin();
    const event = created(await create(cookie, valid).expect(201));
    expect(event.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(event).toEqual({
      id: event.id,
      name: valid.name,
      slug: valid.slug,
      folioPrefix: 'LMP',
      timeZone: 'America/Mexico_City',
      startsAt: '2026-11-14T16:00:00.000Z',
      endsAt: '2026-11-16T04:00:00.000Z',
      salesEnabled: false,
      archivedAt: null,
      city: 'Guadalajara',
      state: 'Jalisco',
      country: 'MX',
    });

    const [organizationRow] = await client<{ id: string; name: string }[]>`
      SELECT id, name FROM organizations`;
    expect(organizationRow.name).toBe(DEFAULT_ORGANIZATION_NAME);
    const [stored] = await client<Record<string, unknown>[]>`
      SELECT organization_id, sales_enabled, sales_opens_at, sales_closes_at, archived_at
      FROM events WHERE id = ${event.id}`;
    expect(stored).toEqual({
      organization_id: organizationRow.id,
      sales_enabled: false,
      sales_opens_at: null,
      sales_closes_at: null,
      archived_at: null,
    });

    const audit = await client<Record<string, unknown>[]>`
      SELECT event_id, event_slug, event_name, action, actor_user_id, actor_session_id, details
      FROM event_admin_audit`;
    expect(audit).toEqual([
      {
        event_id: event.id,
        event_slug: valid.slug,
        event_name: valid.name,
        action: 'created',
        actor_user_id: userId,
        actor_session_id: sessionId,
        details: {
          name: valid.name,
          slug: valid.slug,
          folioPrefix: 'LMP',
          timeZone: 'America/Mexico_City',
          startsAt: '2026-11-14T16:00:00.000Z',
          endsAt: '2026-11-16T04:00:00.000Z',
          salesEnabled: false,
          city: 'Guadalajara',
          state: 'Jalisco',
          country: 'MX',
        },
      },
    ]);
  });

  it('uses the single existing organization and accepts an event without dates', async () => {
    const organizationId = await organization();
    const { cookie } = await globalAdmin();
    const undated = { ...valid, startsAt: undefined, endsAt: undefined };
    const response = created(await create(cookie, undated).expect(201));
    expect(response).toMatchObject({ startsAt: null, endsAt: null, salesEnabled: false });
    const [event] = await client<{ organization_id: string }[]>`
      SELECT organization_id FROM events WHERE id = ${response.id}`;
    expect(event.organization_id).toBe(organizationId);
    expect(await count('organizations')).toBe(1);
  });

  it('requires the location and stores none of a refused event', async () => {
    const { cookie } = await globalAdmin();
    const response = await create(cookie, { ...valid, city: ' ', country: 'XX' }).expect(400);
    expect(response.body).toMatchObject({ fieldErrors: { city: 'invalid', country: 'invalid' } });
    expect(await count('events')).toBe(0);
  });

  it('refuses event admins and judges with an audited denial and creates nothing', async () => {
    const organizationId = await organization();
    const [{ id: eventId }] = await client<{ id: string }[]>`
      INSERT INTO events (organization_id, name, time_zone) VALUES (${organizationId}, 'Existing', 'Etc/UTC')
      RETURNING id`;
    for (const [role, scopeType, scopeId] of [
      ['admin', 'event', eventId],
      ['judge', 'global', null],
      ['judge', 'event', eventId],
    ] as const) {
      const { cookie } = await session(role, scopeType, scopeId);
      const before = await denials();
      await create(cookie, valid).expect(401);
      expect(await denials()).toBe(before + 1);
    }
    expect(await count('events')).toBe(1);
    expect(await count('event_admin_audit')).toBe(0);
  });

  it('refuses a missing session, a missing Origin and a missing CSRF token', async () => {
    const { cookie } = await globalAdmin();
    // The Origin is checked before the session, so a session is only required once it matches.
    await server().post('/admin/events').set('Origin', trustedOrigin).send(valid).expect(401);
    await server().post('/admin/events').set('Cookie', cookie).send(valid).expect(403);
    await server()
      .post('/admin/events')
      .set({ ...headers(cookie), Origin: 'https://evil.example' })
      .send(valid)
      .expect(403);
    await server()
      .post('/admin/events')
      .set({ Cookie: cookie, Origin: trustedOrigin })
      .send(valid)
      .expect(403);
    expect(await count('events')).toBe(0);
    expect(await count('organizations')).toBe(0);
  });

  it('returns field errors for invalid input and creates nothing', async () => {
    const { cookie } = await globalAdmin();
    const cases: [Record<string, unknown>, Record<string, string>][] = [
      [{ ...valid, folioPrefix: 'lmp' }, { folioPrefix: 'invalid' }],
      [{ ...valid, slug: 'Not Kebab' }, { slug: 'invalid' }],
      [{ ...valid, timeZone: 'Mars/Olympus' }, { timeZone: 'invalid' }],
      [{ ...valid, endsAt: valid.startsAt }, { endsAt: 'invalid' }],
      [{ ...valid, startsAt: 'tomorrow' }, { startsAt: 'invalid' }],
    ];
    for (const [body, fieldErrors] of cases) {
      const response = await create(cookie, body).expect(400);
      expect(response.body).toEqual({ statusCode: 400, message: 'Invalid event', fieldErrors });
    }
    expect(await count('events')).toBe(0);
    expect(await count('organizations')).toBe(0);
    expect(await count('event_admin_audit')).toBe(0);
  });

  it('reports a taken slug as a field error and creates nothing', async () => {
    const { cookie } = await globalAdmin();
    await create(cookie, valid).expect(201);
    const response = await create(cookie, { ...valid, name: 'Otro', folioPrefix: 'OTR' }).expect(
      409,
    );
    expect(response.body).toEqual({
      statusCode: 409,
      message: 'Slug already in use',
      code: 'slug_taken',
      fieldErrors: { slug: 'taken' },
    });
    expect(await count('events')).toBe(1);
    expect(await count('event_admin_audit')).toBe(1);
  });

  it('reports a slug taken by a concurrent creation as the same field error', async () => {
    const { cookie } = await globalAdmin();
    const responses = await Promise.all([
      create(cookie, valid),
      create(cookie, { ...valid, folioPrefix: 'OTR' }),
    ]);
    expect(responses.map((response) => response.status).sort()).toEqual([201, 409]);
    expect(responses.find((response) => response.status === 409)?.body).toMatchObject({
      code: 'slug_taken',
      fieldErrors: { slug: 'taken' },
    });
    expect(await count('events')).toBe(1);
    expect(await count('organizations')).toBe(1);
  });

  it('refuses creation when more than one organization exists', async () => {
    await organization('One');
    await organization('Two');
    const { cookie } = await globalAdmin();
    const response = await create(cookie, valid).expect(409);
    expect(response.body).toEqual({
      statusCode: 409,
      message: 'More than one organization exists',
      code: 'organization_ambiguous',
    });
    expect(await count('events')).toBe(0);
    expect(await count('event_admin_audit')).toBe(0);
  });

  it('lists events with slug, folio prefix, time zone, dates, sales, location and archived state, hiding archived ones by default', async () => {
    const organizationId = await organization();
    const [active, archived] = await client<{ id: string }[]>`
      INSERT INTO events (organization_id, name, time_zone, slug, folio_prefix)
      VALUES (${organizationId}, 'Active', 'Etc/UTC', 'active', 'ACT'),
             (${organizationId}, 'Archived', 'Etc/UTC', 'archived', 'ARC')
      RETURNING id`;
    await client`UPDATE events SET archived_at = '2026-10-01T12:00:00Z' WHERE id = ${archived.id}`;
    await client`
      UPDATE events
      SET starts_at = '2026-11-14T16:00:00Z', ends_at = '2026-11-16T04:00:00Z', sales_enabled = true,
        city = 'Guadalajara', state = 'Jalisco', country = 'MX'
      WHERE id = ${active.id}`;
    const { cookie } = await globalAdmin();
    const activeItem = {
      id: active.id,
      name: 'Active',
      slug: 'active',
      folioPrefix: 'ACT',
      archivedAt: null,
      timeZone: 'Etc/UTC',
      startsAt: '2026-11-14T16:00:00.000Z',
      endsAt: '2026-11-16T04:00:00.000Z',
      salesEnabled: true,
      city: 'Guadalajara',
      state: 'Jalisco',
      country: 'MX',
    };
    const archivedItem = {
      id: archived.id,
      name: 'Archived',
      slug: 'archived',
      folioPrefix: 'ARC',
      archivedAt: '2026-10-01T12:00:00.000Z',
      timeZone: 'Etc/UTC',
      startsAt: null,
      endsAt: null,
      salesEnabled: false,
      city: null,
      state: null,
      country: null,
    };
    const list = (query = '') => server().get(`/admin/events${query}`).set('Cookie', cookie);
    expect((await list().expect(200)).body).toEqual([activeItem]);
    expect((await list('?archived=false').expect(200)).body).toEqual([activeItem]);
    expect((await list('?archived=true').expect(200)).body).toEqual([activeItem, archivedItem]);

    // Event admins keep their scope, archived events included only on request.
    const scoped = await session('admin', 'event', archived.id);
    const scopedList = (query = '') =>
      server().get(`/admin/events${query}`).set('Cookie', scoped.cookie);
    expect((await scopedList().expect(200)).body).toEqual([]);
    expect((await scopedList('?archived=true').expect(200)).body).toEqual([archivedItem]);
  });

  it('returns slug, folio prefix, sales and archived state in the foundation', async () => {
    const { cookie } = await globalAdmin();
    const { id } = created(await create(cookie, valid).expect(201));
    await client`UPDATE events SET archived_at = '2026-10-01T12:00:00Z' WHERE id = ${id}`;
    const response = await server()
      .get(`/admin/events/${id}/foundation`)
      .set('Cookie', cookie)
      .expect(200);
    expect((response.body as { event: unknown }).event).toEqual({
      id,
      name: valid.name,
      slug: valid.slug,
      folioPrefix: 'LMP',
      timeZone: 'America/Mexico_City',
      startsAt: '2026-11-14T16:00:00.000Z',
      endsAt: '2026-11-16T04:00:00.000Z',
      windowStatus: 'bounded',
      salesEnabled: false,
      archivedAt: '2026-10-01T12:00:00.000Z',
      city: 'Guadalajara',
      state: 'Jalisco',
      country: 'MX',
    });
  });
});
