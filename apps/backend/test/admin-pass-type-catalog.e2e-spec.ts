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
import { PostgresHarness } from './support/postgres-harness';

jest.setTimeout(120_000);

type Access = { activityId: string; access: string };
type PassType = {
  id: string;
  eventId: string;
  name: string;
  passClass: string;
  priceCents: number;
  requiresPassClass: string | null;
  status: string;
  version: number;
  activities: Access[];
};
type AuditRow = {
  event_id: string;
  actor_user_id: string;
  actor_session_id: string;
  entity_type: string;
  entity_id: string;
  operation: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
};

const byActivity = (left: Access, right: Access) =>
  left.activityId < right.activityId ? -1 : left.activityId > right.activityId ? 1 : 0;

describe('admin pass type catalog (e2e)', () => {
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
      INSERT INTO events (organization_id, name, time_zone)
      VALUES (${org}, 'One', 'Etc/UTC'), (${org}, 'Two', 'Etc/UTC') RETURNING id`;
    const [{ id: venue }] = await client<{ id: string }[]>`
      INSERT INTO venues (organization_id, name) VALUES (${org}, 'Hall') RETURNING id`;
    await client`INSERT INTO event_venues (organization_id, event_id, venue_id)
      VALUES (${org}, ${event.id}, ${venue}), (${org}, ${other.id}, ${venue})`;
    const [battle, workshop, retired, foreign] = await client<{ id: string }[]>`
      INSERT INTO activities (event_id, venue_id, kind, name, starts_at, ends_at, status)
      VALUES (${event.id}, ${venue}, 'battle', 'Breaking 1v1', '2026-11-20T18:00:00Z', '2026-11-20T20:00:00Z', 'active'),
        (${event.id}, ${venue}, 'workshop', 'Toprock', '2026-11-20T10:00:00Z', '2026-11-20T12:00:00Z', 'active'),
        (${event.id}, ${venue}, 'battle', 'Retired', '2026-11-20T13:00:00Z', '2026-11-20T14:00:00Z', 'archived'),
        (${other.id}, ${venue}, 'battle', 'Foreign', '2026-11-20T10:00:00Z', '2026-11-20T12:00:00Z', 'active')
      RETURNING id`;
    return {
      event: event.id,
      other: other.id,
      battle: battle.id,
      workshop: workshop.id,
      retired: retired.id,
      foreign: foreign.id,
    };
  }
  async function seedPassType(
    eventId: string,
    name: string,
    passClass = 'full',
    status = 'active',
    requiresPassClass: string | null = null,
  ) {
    const [{ id }] = await client<{ id: string }[]>`
      INSERT INTO event_pass_types (event_id, name, pass_class, price_cents, requires_pass_class, status)
      VALUES (${eventId}, ${name}, ${passClass}, 120000, ${requiresPassClass}, ${status}) RETURNING id`;
    return id;
  }
  async function session(role: string, eventId: string) {
    const [{ id: userId }] = await client<
      { id: string }[]
    >`INSERT INTO users (email, display_name, active) VALUES (${randomBytes(8).toString('hex') + '@example.com'}, 'Operator', true) RETURNING id`;
    await client`INSERT INTO user_roles (user_id, role, scope_type, scope_id) VALUES (${userId}, ${role}, 'event', ${eventId})`;
    const token = randomBytes(32).toString('hex');
    const [{ id: sessionId }] = await client<
      { id: string }[]
    >`INSERT INTO auth_sessions (user_id, token_digest, expires_at) VALUES (${userId}, ${createHash('sha256').update(token).digest('hex')}, now() + interval '1 hour') RETURNING id`;
    return { cookie: `nb_admin_session=${token}`, userId, sessionId };
  }
  const trustedOrigin = process.env.AUTH_TRUSTED_ORIGIN ?? 'http://localhost:5173';
  const headers = (cookie: string) => ({
    Cookie: cookie,
    Origin: trustedOrigin,
    'X-CSRF-Token': createHash('sha256')
      .update(`nb-admin-csrf-v1:${cookie.slice('nb_admin_session='.length)}`)
      .digest('hex'),
  });
  const server = () => request(app.getHttpServer());
  const list = (event: string) => server().get(`/admin/events/${event}/pass-types`);
  const create = (event: string) => server().post(`/admin/events/${event}/pass-types`);
  const update = (event: string, id: string) =>
    server().patch(`/admin/events/${event}/pass-types/${id}`);
  const access = (event: string, id: string) =>
    server().put(`/admin/events/${event}/pass-types/${id}/activities`);
  const archive = (event: string, id: string) =>
    server().post(`/admin/events/${event}/pass-types/${id}/archive`);
  const restore = (event: string, id: string) =>
    server().post(`/admin/events/${event}/pass-types/${id}/restore`);
  async function audits() {
    return client<
      AuditRow[]
    >`SELECT event_id, actor_user_id, actor_session_id, entity_type, entity_id, operation, before, after FROM event_catalog_audit ORDER BY occurred_at, id`;
  }
  async function snapshot() {
    const passTypes =
      await client`SELECT id, event_id, name, pass_class, price_cents, requires_pass_class, status, version FROM event_pass_types ORDER BY id`;
    const links =
      await client`SELECT pass_type_id, activity_id, access FROM event_pass_type_activities ORDER BY pass_type_id, activity_id`;
    return { passTypes, links };
  }

  it('creates a pass type with initial activity access and an attributed create audit fact', async () => {
    const { event, battle, workshop } = await fixture();
    const { cookie, userId, sessionId } = await session('admin', event);
    const response = await create(event)
      .set(headers(cookie))
      .send({
        name: ' Full pass ',
        passClass: 'full',
        priceCents: 120000,
        activities: [
          { activityId: workshop, access: 'included' },
          { activityId: battle, access: 'selectable' },
        ],
      })
      .expect(201);
    const created = response.body as PassType;
    expect(created).toEqual({
      id: expect.any(String) as string,
      eventId: event,
      name: 'Full pass',
      passClass: 'full',
      priceCents: 120000,
      requiresPassClass: null,
      status: 'active',
      version: 1,
      activities: [
        { activityId: workshop, access: 'included' },
        { activityId: battle, access: 'selectable' },
      ].sort(byActivity),
    });
    const links = await client<
      { activity_id: string; access: string }[]
    >`SELECT activity_id, access FROM event_pass_type_activities WHERE pass_type_id = ${created.id} AND event_id = ${event} ORDER BY activity_id`;
    expect(links.map((link) => ({ activityId: link.activity_id, access: link.access }))).toEqual(
      created.activities,
    );
    const facts = await audits();
    expect(facts).toEqual([
      {
        event_id: event,
        actor_user_id: userId,
        actor_session_id: sessionId,
        entity_type: 'pass_type',
        entity_id: created.id,
        operation: 'create',
        before: null,
        after: created,
      },
    ]);
    expect(JSON.stringify(facts[0])).not.toMatch(/example.com|nb_admin_session/);

    const addOn = await create(event)
      .set(headers(cookie))
      .send({ name: 'Open Styles', passClass: 'add_on', priceCents: 0, requiresPassClass: 'full' })
      .expect(201);
    expect(addOn.body).toMatchObject({
      passClass: 'add_on',
      priceCents: 0,
      requiresPassClass: 'full',
      activities: [],
    });
  });

  it('lists every pass type of the event with status, version, class, price and access list', async () => {
    const { event, other, battle, workshop } = await fixture();
    const { cookie } = await session('admin', event);
    const general = await seedPassType(event, 'General entry', 'general', 'archived');
    const openStyles = await seedPassType(event, 'Open Styles', 'add_on', 'active', 'full');
    await seedPassType(other, 'Foreign pass');
    await client`INSERT INTO event_pass_type_activities (event_id, pass_type_id, activity_id, access)
      VALUES (${event}, ${openStyles}, ${battle}, 'selectable'), (${event}, ${openStyles}, ${workshop}, 'included')`;
    const response = await list(event).set('Cookie', cookie).expect(200);
    const body = response.body as PassType[];
    expect(body.map((passType) => passType.id)).toEqual([general, openStyles]);
    expect(body[0]).toEqual({
      id: general,
      eventId: event,
      name: 'General entry',
      passClass: 'general',
      priceCents: 120000,
      requiresPassClass: null,
      status: 'archived',
      version: 1,
      activities: [],
    });
    expect(body[1]).toMatchObject({
      passClass: 'add_on',
      requiresPassClass: 'full',
      status: 'active',
      activities: [
        { activityId: battle, access: 'selectable' },
        { activityId: workshop, access: 'included' },
      ].sort(byActivity),
    });
  });

  it('rejects list for judges, unauthenticated callers and admins of another event', async () => {
    const { event, other } = await fixture();
    const judge = await session('judge', event);
    const otherAdmin = await session('admin', other);
    await list(event).expect(401);
    await list(event).set('Cookie', judge.cookie).expect(401);
    await list(event).set('Cookie', otherAdmin.cookie).expect(401);
  });

  it('rejects invalid create input and unusable activities without writes', async () => {
    const { event, battle, retired, foreign } = await fixture();
    const { cookie } = await session('admin', event);
    const before = await snapshot();
    const base = { name: 'Full pass', passClass: 'full', priceCents: 1000 };
    for (const payload of [
      { ...base, name: ' ' },
      { ...base, name: 7 },
      { ...base, passClass: 'vip' },
      { ...base, passClass: undefined },
      { ...base, priceCents: -1 },
      { ...base, priceCents: 1.5 },
      { ...base, priceCents: '1000' },
      { ...base, priceCents: 2147483648 },
      { ...base, requiresPassClass: 'full' },
      { ...base, passClass: 'general', requiresPassClass: 'full' },
      { ...base, passClass: 'add_on', requiresPassClass: 'add_on' },
      { ...base, activities: 'all' },
      { ...base, activities: [{ activityId: battle, access: 'vip' }] },
      { ...base, activities: [{ activityId: 'not-a-uuid', access: 'included' }] },
      {
        ...base,
        activities: [
          { activityId: battle, access: 'included' },
          { activityId: battle.toUpperCase(), access: 'selectable' },
        ],
      },
      { ...base, activities: [{ activityId: retired, access: 'included' }] },
      { ...base, activities: [{ activityId: foreign, access: 'included' }] },
      {
        ...base,
        activities: [{ activityId: '00000000-0000-4000-8000-000000000000', access: 'included' }],
      },
      [],
    ])
      await create(event).set(headers(cookie)).send(payload).expect(400);
    expect(await snapshot()).toEqual(before);
    expect(await audits()).toHaveLength(0);
  });

  it('rejects a duplicate active name with 409 and allows reusing it after archive', async () => {
    const { event, other } = await fixture();
    const { cookie } = await session('admin', event);
    const existing = await seedPassType(event, 'Full pass');
    await seedPassType(other, 'Second pass');
    await create(event)
      .set(headers(cookie))
      .send({ name: ' FULL PASS ', passClass: 'full', priceCents: 1 })
      .expect(409);
    const second = await create(event)
      .set(headers(cookie))
      .send({ name: 'Second pass', passClass: 'full', priceCents: 1 })
      .expect(201);
    await update(event, (second.body as PassType).id)
      .set(headers(cookie))
      .send({ expectedVersion: 1, name: 'full pass' })
      .expect(409);
    expect(await audits()).toHaveLength(1);
    await archive(event, existing).set(headers(cookie)).send({ expectedVersion: 1 }).expect(201);
    await create(event)
      .set(headers(cookie))
      .send({ name: 'Full pass', passClass: 'full', priceCents: 2 })
      .expect(201);
    const names = await client<
      { name: string; status: string }[]
    >`SELECT name, status FROM event_pass_types WHERE event_id = ${event} ORDER BY status, name`;
    expect(names).toEqual([
      { name: 'Full pass', status: 'active' },
      { name: 'Second pass', status: 'active' },
      { name: 'Full pass', status: 'archived' },
    ]);
  });

  it('updates with the expected version, audits before and after, and keeps purchased price snapshots', async () => {
    const { event, battle } = await fixture();
    const { cookie, userId, sessionId } = await session('admin', event);
    const passType = await seedPassType(event, 'Full pass');
    await client`INSERT INTO event_pass_type_activities (event_id, pass_type_id, activity_id, access)
      VALUES (${event}, ${passType}, ${battle}, 'selectable')`;
    const [{ id: participant }] = await client<
      { id: string }[]
    >`INSERT INTO participants (full_name) VALUES ('Dancer') RETURNING id`;
    const [{ id: registration }] = await client<
      { id: string }[]
    >`INSERT INTO event_registrations (event_id, participant_id) VALUES (${event}, ${participant}) RETURNING id`;
    await client`INSERT INTO event_registration_passes (event_id, event_registration_id, pass_type_id, price_cents)
      VALUES (${event}, ${registration}, ${passType}, 120000)`;

    const response = await update(event, passType)
      .set(headers(cookie))
      .send({ expectedVersion: 1, name: ' Open Styles ', passClass: 'add_on', priceCents: 150000 })
      .expect(200);
    const updated = response.body as PassType;
    expect(updated).toEqual({
      id: passType,
      eventId: event,
      name: 'Open Styles',
      passClass: 'add_on',
      priceCents: 150000,
      requiresPassClass: null,
      status: 'active',
      version: 2,
      activities: [{ activityId: battle, access: 'selectable' }],
    });
    const second = await update(event, passType)
      .set(headers(cookie))
      .send({ expectedVersion: 2, requiresPassClass: 'full' })
      .expect(200);
    expect(second.body).toMatchObject({ requiresPassClass: 'full', version: 3 });
    const third = await update(event, passType)
      .set(headers(cookie))
      .send({ expectedVersion: 3, passClass: 'full', requiresPassClass: null })
      .expect(200);
    expect(third.body).toMatchObject({ passClass: 'full', requiresPassClass: null, version: 4 });

    const facts = await audits();
    expect(facts).toHaveLength(3);
    expect(facts[0]).toEqual({
      event_id: event,
      actor_user_id: userId,
      actor_session_id: sessionId,
      entity_type: 'pass_type',
      entity_id: passType,
      operation: 'update',
      before: { ...updated, name: 'Full pass', passClass: 'full', priceCents: 120000, version: 1 },
      after: updated,
    });
    expect(
      await client`SELECT price_cents FROM event_registration_passes WHERE pass_type_id = ${passType}`,
    ).toEqual([{ price_cents: 120000 }]);
  });

  it('rejects invalid updates with 400, stale versions and archived pass types with 409, without writes', async () => {
    const { event } = await fixture();
    const { cookie } = await session('admin', event);
    const passType = await seedPassType(event, 'Full pass');
    const addOn = await seedPassType(event, 'Open Styles', 'add_on', 'active', 'full');
    const archived = await seedPassType(event, 'Old pass', 'full', 'archived');
    const before = await snapshot();
    for (const payload of [
      { name: 'Missing version' },
      { expectedVersion: 0, name: 'Bad version' },
      { expectedVersion: '1', name: 'Bad version' },
      { expectedVersion: 1 },
      { expectedVersion: 1, name: ' ' },
      { expectedVersion: 1, passClass: 'vip' },
      { expectedVersion: 1, priceCents: -5 },
      { expectedVersion: 1, requiresPassClass: 'full' },
    ])
      await update(event, passType).set(headers(cookie)).send(payload).expect(400);
    await update(event, addOn)
      .set(headers(cookie))
      .send({ expectedVersion: 1, passClass: 'general' })
      .expect(400);
    const stale = await update(event, passType)
      .set(headers(cookie))
      .send({ expectedVersion: 2, name: 'Stale' })
      .expect(409);
    expect(stale.body).toMatchObject({ message: 'Pass type version conflict' });
    const frozen = await update(event, archived)
      .set(headers(cookie))
      .send({ expectedVersion: 1, name: 'Revived' })
      .expect(409);
    expect(frozen.body).toMatchObject({ message: 'Pass type is archived' });
    expect(await snapshot()).toEqual(before);
    expect(await audits()).toHaveLength(0);
  });

  it('replaces the activity access list with the expected version and audits an access change', async () => {
    const { event, battle, workshop } = await fixture();
    const { cookie, userId, sessionId } = await session('admin', event);
    const passType = await seedPassType(event, 'Full pass');
    await client`INSERT INTO event_pass_type_activities (event_id, pass_type_id, activity_id, access)
      VALUES (${event}, ${passType}, ${battle}, 'selectable')`;
    const response = await access(event, passType)
      .set(headers(cookie))
      .send({
        expectedVersion: 1,
        activities: [
          { activityId: battle, access: 'included' },
          { activityId: workshop, access: 'included' },
        ],
      })
      .expect(200);
    const changed = response.body as PassType;
    const after = [
      { activityId: battle, access: 'included' },
      { activityId: workshop, access: 'included' },
    ].sort(byActivity);
    expect(changed).toMatchObject({ id: passType, version: 2, activities: after });
    const [fact] = await audits();
    expect(fact).toEqual({
      event_id: event,
      actor_user_id: userId,
      actor_session_id: sessionId,
      entity_type: 'pass_type',
      entity_id: passType,
      operation: 'access_change',
      before: {
        ...changed,
        version: 1,
        activities: [{ activityId: battle, access: 'selectable' }],
      },
      after: changed,
    });

    const cleared = await access(event, passType)
      .set(headers(cookie))
      .send({ expectedVersion: 2, activities: [] })
      .expect(200);
    expect(cleared.body).toMatchObject({ version: 3, activities: [] });
    expect(
      await client`SELECT activity_id FROM event_pass_type_activities WHERE pass_type_id = ${passType}`,
    ).toHaveLength(0);
    expect(await audits()).toHaveLength(2);
  });

  it('rejects invalid access lists, stale versions and archived pass types without writes', async () => {
    const { event, battle, retired, foreign } = await fixture();
    const { cookie } = await session('admin', event);
    const passType = await seedPassType(event, 'Full pass');
    const archived = await seedPassType(event, 'Old pass', 'full', 'archived');
    await client`INSERT INTO event_pass_type_activities (event_id, pass_type_id, activity_id, access)
      VALUES (${event}, ${passType}, ${battle}, 'selectable')`;
    const before = await snapshot();
    for (const payload of [
      { activities: [] },
      { expectedVersion: 1 },
      { expectedVersion: 1, activities: [{ activityId: battle, access: 'vip' }] },
      { expectedVersion: 1, activities: [{ activityId: battle }] },
      {
        expectedVersion: 1,
        activities: [
          { activityId: battle, access: 'included' },
          { activityId: battle, access: 'selectable' },
        ],
      },
      { expectedVersion: 1, activities: [{ activityId: retired, access: 'included' }] },
      { expectedVersion: 1, activities: [{ activityId: foreign, access: 'included' }] },
    ])
      await access(event, passType).set(headers(cookie)).send(payload).expect(400);
    const stale = await access(event, passType)
      .set(headers(cookie))
      .send({ expectedVersion: 2, activities: [] })
      .expect(409);
    expect(stale.body).toMatchObject({ message: 'Pass type version conflict' });
    const frozen = await access(event, archived)
      .set(headers(cookie))
      .send({ expectedVersion: 1, activities: [] })
      .expect(409);
    expect(frozen.body).toMatchObject({ message: 'Pass type is archived' });
    expect(await snapshot()).toEqual(before);
    expect(await audits()).toHaveLength(0);
  });

  it('archives with the expected version, keeps the record and audits; archived pass types cannot be re-archived', async () => {
    const { event, battle } = await fixture();
    const { cookie, userId, sessionId } = await session('admin', event);
    const passType = await seedPassType(event, 'Full pass');
    await client`INSERT INTO event_pass_type_activities (event_id, pass_type_id, activity_id, access)
      VALUES (${event}, ${passType}, ${battle}, 'selectable')`;
    await archive(event, passType).set(headers(cookie)).send({ expectedVersion: 2 }).expect(409);
    const response = await archive(event, passType)
      .set(headers(cookie))
      .send({ expectedVersion: 1 })
      .expect(201);
    const archived = response.body as PassType;
    expect(archived).toMatchObject({
      id: passType,
      status: 'archived',
      version: 2,
      activities: [{ activityId: battle, access: 'selectable' }],
    });
    const [fact] = await audits();
    expect(fact).toEqual({
      event_id: event,
      actor_user_id: userId,
      actor_session_id: sessionId,
      entity_type: 'pass_type',
      entity_id: passType,
      operation: 'archive',
      before: { ...archived, status: 'active', version: 1 },
      after: archived,
    });
    const again = await archive(event, passType)
      .set(headers(cookie))
      .send({ expectedVersion: 2 })
      .expect(409);
    expect(again.body).toMatchObject({ message: 'Pass type is archived' });
    expect(await client`SELECT id FROM event_pass_types WHERE id = ${passType}`).toHaveLength(1);
    expect(await audits()).toHaveLength(1);
  });

  it('restores an archived pass type with the expected version, keeps its access links and audits', async () => {
    const { event, battle, workshop } = await fixture();
    const { cookie, userId, sessionId } = await session('admin', event);
    const passType = await seedPassType(event, 'Full pass');
    await client`INSERT INTO event_pass_type_activities (event_id, pass_type_id, activity_id, access)
      VALUES (${event}, ${passType}, ${battle}, 'included'), (${event}, ${passType}, ${workshop}, 'selectable')`;
    const notArchived = await restore(event, passType)
      .set(headers(cookie))
      .send({ expectedVersion: 1 })
      .expect(409);
    expect(notArchived.body).toMatchObject({ message: 'Pass type is not archived' });
    const archived = (
      await archive(event, passType).set(headers(cookie)).send({ expectedVersion: 1 }).expect(201)
    ).body as PassType;
    // A linked activity archived meanwhile keeps its link; restoring the pass type does not prune it.
    await client`UPDATE activities SET status = 'archived' WHERE id = ${workshop}`;
    const before = await snapshot();
    const stale = await restore(event, passType)
      .set(headers(cookie))
      .send({ expectedVersion: 1 })
      .expect(409);
    expect(stale.body).toMatchObject({ message: 'Pass type version conflict' });
    expect(await snapshot()).toEqual(before);

    const response = await restore(event, passType)
      .set(headers(cookie))
      .send({ expectedVersion: 2 })
      .expect(201);
    const restored = response.body as PassType;
    expect(restored).toEqual({
      ...archived,
      status: 'active',
      version: 3,
      activities: [
        { activityId: battle, access: 'included' },
        { activityId: workshop, access: 'selectable' },
      ].sort(byActivity),
    });
    expect((await snapshot()).links).toEqual(before.links);
    const [, fact] = await audits();
    expect(fact).toEqual({
      event_id: event,
      actor_user_id: userId,
      actor_session_id: sessionId,
      entity_type: 'pass_type',
      entity_id: passType,
      operation: 'restore',
      before: archived,
      after: restored,
    });
    // Both default to the transaction start, so equality proves the restore set `updated_at`.
    const [{ touched }] = await client<{ touched: boolean }[]>`
      SELECT p.updated_at = a.occurred_at AS touched
      FROM event_pass_types p JOIN event_catalog_audit a ON a.entity_id = p.id
      WHERE p.id = ${passType} AND a.operation = 'restore'`;
    expect(touched).toBe(true);
    const again = await restore(event, passType)
      .set(headers(cookie))
      .send({ expectedVersion: 3 })
      .expect(409);
    expect(again.body).toMatchObject({ message: 'Pass type is not archived' });
    expect(await audits()).toHaveLength(2);
  });

  it('rejects restoring a pass type whose name an active pass type now uses, without writes', async () => {
    const { event } = await fixture();
    const { cookie } = await session('admin', event);
    const passType = await seedPassType(event, 'Full pass');
    await archive(event, passType).set(headers(cookie)).send({ expectedVersion: 1 }).expect(201);
    await create(event)
      .set(headers(cookie))
      .send({ name: ' FULL PASS ', passClass: 'full', priceCents: 1 })
      .expect(201);
    const before = await snapshot();
    const conflict = await restore(event, passType)
      .set(headers(cookie))
      .send({ expectedVersion: 2 })
      .expect(409);
    expect(conflict.body).toMatchObject({
      message:
        'An active pass type with this name already exists; rename one of them before restoring',
    });
    expect(await snapshot()).toEqual(before);
    expect(await audits()).toHaveLength(2);
  });

  it('archives and restores a sold pass type without touching held passes, selections or entitlements', async () => {
    const { event, battle, workshop } = await fixture();
    const { cookie } = await session('admin', event);
    const passType = await seedPassType(event, 'Full pass');
    await client`INSERT INTO event_pass_type_activities (event_id, pass_type_id, activity_id, access)
      VALUES (${event}, ${passType}, ${battle}, 'included'), (${event}, ${passType}, ${workshop}, 'selectable')`;
    const registration = async () => {
      const [{ id: participant }] = await client<
        { id: string }[]
      >`INSERT INTO participants (full_name) VALUES ('Dancer') RETURNING id`;
      const [{ id }] = await client<
        { id: string }[]
      >`INSERT INTO event_registrations (event_id, participant_id) VALUES (${event}, ${participant}) RETURNING id`;
      return id;
    };
    const holder = await registration();
    const [{ id: held }] = await client<{ id: string }[]>`
      INSERT INTO event_registration_passes (event_id, event_registration_id, pass_type_id, price_cents)
      VALUES (${event}, ${holder}, ${passType}, 120000) RETURNING id`;
    await client`INSERT INTO event_registration_pass_selections (event_id, registration_pass_id, activity_id)
      VALUES (${event}, ${held}, ${workshop})`;
    const newcomer = await registration();
    const sold = async () => ({
      passes:
        await client`SELECT * FROM event_registration_passes WHERE event_id = ${event} ORDER BY id`,
      selections:
        await client`SELECT * FROM event_registration_pass_selections WHERE event_id = ${event} ORDER BY registration_pass_id, activity_id`,
    });
    const entitlements = async () =>
      (
        await server()
          .get(`/admin/events/${event}/registrations/${holder}/entitlements`)
          .set(headers(cookie))
          .expect(200)
      ).body as unknown;
    const assign = () =>
      server()
        .post(`/admin/events/${event}/registrations/${newcomer}/passes`)
        .set(headers(cookie))
        .send({ passTypeId: passType });
    const soldBefore = await sold();
    const entitledBefore = await entitlements();
    expect(entitledBefore).toMatchObject({
      accessibleActivityIds: [battle, workshop].sort(),
    });

    await archive(event, passType).set(headers(cookie)).send({ expectedVersion: 1 }).expect(201);
    expect(await sold()).toEqual(soldBefore);
    expect(await entitlements()).toEqual(entitledBefore);
    await assign().expect(409);

    await restore(event, passType).set(headers(cookie)).send({ expectedVersion: 2 }).expect(201);
    expect(await sold()).toEqual(soldBefore);
    expect(await entitlements()).toEqual(entitledBefore);
    await assign().expect(201);
  });

  it('returns 404 for pass types of another event and unknown ids without writes', async () => {
    const { event, other } = await fixture();
    const { cookie } = await session('admin', event);
    const foreign = await seedPassType(other, 'Foreign pass');
    const before = await snapshot();
    for (const id of [foreign, '00000000-0000-4000-8000-000000000000']) {
      await update(event, id)
        .set(headers(cookie))
        .send({ expectedVersion: 1, name: 'X' })
        .expect(404);
      await access(event, id)
        .set(headers(cookie))
        .send({ expectedVersion: 1, activities: [] })
        .expect(404);
      await archive(event, id).set(headers(cookie)).send({ expectedVersion: 1 }).expect(404);
      await restore(event, id).set(headers(cookie)).send({ expectedVersion: 1 }).expect(404);
    }
    expect(await snapshot()).toEqual(before);
    expect(await audits()).toHaveLength(0);
  });

  it('rejects writes from judges, unauthenticated callers, other-event admins and missing CSRF or origin', async () => {
    const { event, other } = await fixture();
    const admin = await session('admin', event);
    const judge = await session('judge', event);
    const otherAdmin = await session('admin', other);
    const passType = await seedPassType(event, 'Full pass');
    const retired = await seedPassType(event, 'Old pass', 'full', 'archived');
    const before = await snapshot();
    const commands = [
      () => create(event).send({ name: 'X', passClass: 'full', priceCents: 1 }),
      () => update(event, passType).send({ expectedVersion: 1, name: 'X' }),
      () => access(event, passType).send({ expectedVersion: 1, activities: [] }),
      () => archive(event, passType).send({ expectedVersion: 1 }),
      () => restore(event, retired).send({ expectedVersion: 1 }),
    ];
    for (const command of commands) {
      await command().set('Origin', trustedOrigin).expect(401);
      await command().set(headers(judge.cookie)).expect(401);
      await command().set(headers(otherAdmin.cookie)).expect(401);
      await command()
        .set('Cookie', admin.cookie)
        .set('X-CSRF-Token', headers(admin.cookie)['X-CSRF-Token'])
        .expect(403);
      await command()
        .set(headers(admin.cookie))
        .set('Origin', 'https://untrusted.example')
        .expect(403);
      await command().set('Cookie', admin.cookie).set('Origin', trustedOrigin).expect(403);
      await command().set(headers(admin.cookie)).set('X-CSRF-Token', '0'.repeat(64)).expect(403);
    }
    expect(await snapshot()).toEqual(before);
    expect(await audits()).toHaveLength(0);
  });

  it('rolls back the mutation when the catalog audit fact cannot be written', async () => {
    const { event, battle } = await fixture();
    const { cookie } = await session('admin', event);
    const passType = await seedPassType(event, 'Full pass');
    const retired = await seedPassType(event, 'Old pass', 'full', 'archived');
    const before = await snapshot();
    await client`ALTER TABLE event_catalog_audit ADD CONSTRAINT reject_pass_type_test CHECK (entity_type <> 'pass_type') NOT VALID`;
    try {
      await create(event)
        .set(headers(cookie))
        .send({
          name: 'Lost',
          passClass: 'full',
          priceCents: 1,
          activities: [{ activityId: battle, access: 'included' }],
        })
        .expect(500);
      await update(event, passType)
        .set(headers(cookie))
        .send({ expectedVersion: 1, name: 'Lost' })
        .expect(500);
      await access(event, passType)
        .set(headers(cookie))
        .send({ expectedVersion: 1, activities: [{ activityId: battle, access: 'included' }] })
        .expect(500);
      await archive(event, passType).set(headers(cookie)).send({ expectedVersion: 1 }).expect(500);
      await restore(event, retired).set(headers(cookie)).send({ expectedVersion: 1 }).expect(500);
    } finally {
      await client`ALTER TABLE event_catalog_audit DROP CONSTRAINT reject_pass_type_test`;
    }
    expect(await snapshot()).toEqual(before);
    expect(await audits()).toHaveLength(0);
  });
});
