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

type Activity = {
  id: string;
  eventId: string;
  venueId: string;
  kind: string;
  name: string;
  startsAt: string;
  endsAt: string;
  status: string;
  version: number;
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

describe('admin activity catalog (e2e)', () => {
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
    const [venue, foreignVenue] = await client<{ id: string }[]>`
      INSERT INTO venues (organization_id, name) VALUES (${org}, 'Hall'), (${org}, 'Annex') RETURNING id`;
    await client`INSERT INTO event_venues (organization_id, event_id, venue_id)
      VALUES (${org}, ${event.id}, ${venue.id}), (${org}, ${other.id}, ${venue.id}), (${org}, ${other.id}, ${foreignVenue.id})`;
    const [late, early, foreign] = await client<{ id: string }[]>`
      INSERT INTO activities (event_id, venue_id, kind, name, starts_at, ends_at)
      VALUES (${event.id}, ${venue.id}, 'battle', 'Late', '2026-11-20T18:00:00Z', '2026-11-20T20:00:00Z'),
        (${event.id}, ${venue.id}, 'workshop', 'Early', '2026-11-20T10:00:00Z', '2026-11-20T12:00:00Z'),
        (${other.id}, ${venue.id}, 'battle', 'Foreign', '2026-11-20T10:00:00Z', '2026-11-20T12:00:00Z')
      RETURNING id`;
    return {
      event: event.id,
      other: other.id,
      venue: venue.id,
      foreignVenue: foreignVenue.id,
      late: late.id,
      early: early.id,
      foreign: foreign.id,
    };
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
  const list = (event: string) => server().get(`/admin/events/${event}/activities`);
  const create = (event: string) => server().post(`/admin/events/${event}/activities`);
  const update = (event: string, id: string) =>
    server().patch(`/admin/events/${event}/activities/${id}`);
  const archive = (event: string, id: string) =>
    server().post(`/admin/events/${event}/activities/${id}/archive`);
  const restore = (event: string, id: string) =>
    server().post(`/admin/events/${event}/activities/${id}/restore`);
  async function archived(event: string, id: string, cookie: string) {
    const response = await archive(event, id)
      .set(headers(cookie))
      .send({ expectedVersion: 1 })
      .expect(201);
    return response.body as Activity;
  }
  async function audits() {
    return client<
      AuditRow[]
    >`SELECT event_id, actor_user_id, actor_session_id, entity_type, entity_id, operation, before, after FROM event_catalog_audit ORDER BY occurred_at, id`;
  }
  async function snapshot() {
    return client`SELECT id, venue_id, kind, name, starts_at, ends_at, status, version FROM activities ORDER BY id`;
  }
  const draft = (venueId: string) => ({
    venueId,
    kind: ' workshop ',
    name: ' Toprock basics ',
    startsAt: '2026-11-21T09:00:00.000Z',
    endsAt: '2026-11-21T10:30:00.000Z',
  });

  it('lists every activity of the event with status and version, ordered by start and name', async () => {
    const { event, early, late, venue } = await fixture();
    const { cookie } = await session('admin', event);
    await client`UPDATE activities SET status = 'archived', version = 2 WHERE id = ${late}`;
    const response = await list(event).set('Cookie', cookie).expect(200);
    const body = response.body as Activity[];
    expect(body.map((activity) => activity.id)).toEqual([early, late]);
    expect(body[0]).toEqual({
      id: early,
      eventId: event,
      venueId: venue,
      kind: 'workshop',
      name: 'Early',
      startsAt: '2026-11-20T10:00:00.000Z',
      endsAt: '2026-11-20T12:00:00.000Z',
      status: 'active',
      version: 1,
    });
    expect(body[1]).toMatchObject({ status: 'archived', version: 2 });
  });

  it('rejects list for judges, unauthenticated callers and admins of another event', async () => {
    const { event, other } = await fixture();
    const judge = await session('judge', event);
    const otherAdmin = await session('admin', other);
    await list(event).expect(401);
    await list(event).set('Cookie', judge.cookie).expect(401);
    await list(event).set('Cookie', otherAdmin.cookie).expect(401);
  });

  it('creates an active version 1 activity with an attributed create audit fact', async () => {
    const { event, venue } = await fixture();
    const { cookie, userId, sessionId } = await session('admin', event);
    const response = await create(event).set(headers(cookie)).send(draft(venue)).expect(201);
    const created = response.body as Activity;
    expect(created).toEqual({
      id: expect.any(String) as string,
      eventId: event,
      venueId: venue,
      kind: 'workshop',
      name: 'Toprock basics',
      startsAt: '2026-11-21T09:00:00.000Z',
      endsAt: '2026-11-21T10:30:00.000Z',
      status: 'active',
      version: 1,
    });
    const [row] = await client<
      { kind: string; name: string; status: string; version: number }[]
    >`SELECT kind, name, status, version FROM activities WHERE id = ${created.id} AND event_id = ${event}`;
    expect(row).toEqual({ kind: 'workshop', name: 'Toprock basics', status: 'active', version: 1 });
    const facts = await audits();
    expect(facts).toHaveLength(1);
    expect(facts[0]).toEqual({
      event_id: event,
      actor_user_id: userId,
      actor_session_id: sessionId,
      entity_type: 'activity',
      entity_id: created.id,
      operation: 'create',
      before: null,
      after: created,
    });
    expect(JSON.stringify(facts[0])).not.toMatch(/example.com|nb_admin_session/);
  });

  it('rejects invalid create input and venues outside the event without writes', async () => {
    const { event, venue, foreignVenue } = await fixture();
    const { cookie } = await session('admin', event);
    const before = await snapshot();
    for (const payload of [
      { ...draft(venue), name: '  ' },
      { ...draft(venue), kind: '' },
      { ...draft(venue), kind: 'x'.repeat(101) },
      { ...draft(venue), name: 7 },
      { ...draft(venue), startsAt: '2026-11-21T11:00:00Z' },
      { ...draft(venue), endsAt: '2026-11-21T09:00:00Z' },
      { ...draft(venue), startsAt: 'tomorrow' },
      { ...draft(venue), venueId: 'not-a-uuid' },
      draft(foreignVenue),
      draft('00000000-0000-4000-8000-000000000000'),
      [],
    ])
      await create(event).set(headers(cookie)).send(payload).expect(400);
    await client`UPDATE events SET starts_at = '2026-11-20T00:00:00Z', ends_at = '2026-11-21T00:00:00Z' WHERE id = ${event}`;
    await create(event).set(headers(cookie)).send(draft(venue)).expect(400);
    expect(await snapshot()).toEqual(before);
    expect(await audits()).toHaveLength(0);
  });

  it('updates with the expected version, increments it and audits before and after', async () => {
    const { event, early, venue } = await fixture();
    const { cookie, userId, sessionId } = await session('admin', event);
    const response = await update(event, early)
      .set(headers(cookie))
      .send({ expectedVersion: 1, name: ' Early session ', endsAt: '2026-11-20T13:00:00Z' })
      .expect(200);
    const updated = response.body as Activity;
    expect(updated).toEqual({
      id: early,
      eventId: event,
      venueId: venue,
      kind: 'workshop',
      name: 'Early session',
      startsAt: '2026-11-20T10:00:00.000Z',
      endsAt: '2026-11-20T13:00:00.000Z',
      status: 'active',
      version: 2,
    });
    const [fact] = await audits();
    expect(fact).toEqual({
      event_id: event,
      actor_user_id: userId,
      actor_session_id: sessionId,
      entity_type: 'activity',
      entity_id: early,
      operation: 'update',
      before: { ...updated, name: 'Early', endsAt: '2026-11-20T12:00:00.000Z', version: 1 },
      after: updated,
    });
  });

  it('rejects stale versions with 409 and invalid updates with 400 without writes', async () => {
    const { event, early, foreignVenue } = await fixture();
    const { cookie } = await session('admin', event);
    const before = await snapshot();
    await update(event, early)
      .set(headers(cookie))
      .send({ expectedVersion: 2, name: 'Stale' })
      .expect(409);
    for (const payload of [
      { name: 'Missing version' },
      { expectedVersion: 0, name: 'Bad version' },
      { expectedVersion: '1', name: 'Bad version' },
      { expectedVersion: 1 },
      { expectedVersion: 1, name: ' ' },
      { expectedVersion: 1, startsAt: '2026-11-20T12:00:00Z' },
      { expectedVersion: 1, venueId: foreignVenue },
    ])
      await update(event, early).set(headers(cookie)).send(payload).expect(400);
    expect(await snapshot()).toEqual(before);
    expect(await audits()).toHaveLength(0);
  });

  it('archives with the expected version and audits; archived activities cannot be edited or re-archived', async () => {
    const { event, late } = await fixture();
    const { cookie, userId, sessionId } = await session('admin', event);
    await archive(event, late).set(headers(cookie)).send({ expectedVersion: 2 }).expect(409);
    const response = await archive(event, late)
      .set(headers(cookie))
      .send({ expectedVersion: 1 })
      .expect(201);
    const archived = response.body as Activity;
    expect(archived).toMatchObject({ id: late, status: 'archived', version: 2 });
    const [fact] = await audits();
    expect(fact).toEqual({
      event_id: event,
      actor_user_id: userId,
      actor_session_id: sessionId,
      entity_type: 'activity',
      entity_id: late,
      operation: 'archive',
      before: { ...archived, status: 'active', version: 1 },
      after: archived,
    });
    await archive(event, late).set(headers(cookie)).send({ expectedVersion: 2 }).expect(409);
    await update(event, late)
      .set(headers(cookie))
      .send({ expectedVersion: 2, name: 'Revived' })
      .expect(409);
    expect(await client`SELECT id FROM activities WHERE id = ${late}`).toHaveLength(1);
    expect(await audits()).toHaveLength(1);
  });

  it('returns 404 for activities of another event and unknown ids without writes', async () => {
    const { event, foreign } = await fixture();
    const { cookie } = await session('admin', event);
    const before = await snapshot();
    const unknown = '00000000-0000-4000-8000-000000000000';
    for (const id of [foreign, unknown]) {
      await update(event, id)
        .set(headers(cookie))
        .send({ expectedVersion: 1, name: 'X' })
        .expect(404);
      await archive(event, id).set(headers(cookie)).send({ expectedVersion: 1 }).expect(404);
    }
    expect(await snapshot()).toEqual(before);
    expect(await audits()).toHaveLength(0);
  });

  it('rejects writes from judges, unauthenticated callers, other-event admins and missing CSRF or origin', async () => {
    const { event, other, early, venue } = await fixture();
    const admin = await session('admin', event);
    const judge = await session('judge', event);
    const otherAdmin = await session('admin', other);
    const before = await snapshot();
    const commands = [
      () => create(event).send(draft(venue)),
      () => update(event, early).send({ expectedVersion: 1, name: 'X' }),
      () => archive(event, early).send({ expectedVersion: 1 }),
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

  it('restores an archived activity with the expected version and audits archived and active snapshots', async () => {
    const { event, late } = await fixture();
    const { cookie, userId, sessionId } = await session('admin', event);
    const archivedActivity = await archived(event, late, cookie);
    const response = await restore(event, late)
      .set(headers(cookie))
      .send({ expectedVersion: 2 })
      .expect(201);
    const restored = response.body as Activity;
    expect(restored).toEqual({ ...archivedActivity, status: 'active', version: 3 });
    const [row] = await client<
      { status: string; version: number }[]
    >`SELECT status, version FROM activities WHERE id = ${late}`;
    expect(row).toEqual({ status: 'active', version: 3 });
    const facts = await audits();
    expect(facts.map((fact) => fact.operation)).toEqual(['archive', 'restore']);
    expect(facts[1]).toEqual({
      event_id: event,
      actor_user_id: userId,
      actor_session_id: sessionId,
      entity_type: 'activity',
      entity_id: late,
      operation: 'restore',
      before: archivedActivity,
      after: restored,
    });
    await update(event, late)
      .set(headers(cookie))
      .send({ expectedVersion: 3, name: 'Revived' })
      .expect(200);
  });

  it('rejects restoring active activities and stale versions with 409 without writes', async () => {
    const { event, early, late } = await fixture();
    const { cookie } = await session('admin', event);
    await archived(event, late, cookie);
    const before = await snapshot();
    const notArchived = await restore(event, early)
      .set(headers(cookie))
      .send({ expectedVersion: 1 })
      .expect(409);
    expect((notArchived.body as { message: string }).message).toBe('Activity is not archived');
    const stale = await restore(event, late)
      .set(headers(cookie))
      .send({ expectedVersion: 1 })
      .expect(409);
    expect((stale.body as { message: string }).message).toBe('Activity version conflict');
    for (const payload of [{}, { expectedVersion: 0 }, { expectedVersion: '2' }, []])
      await restore(event, late).set(headers(cookie)).send(payload).expect(400);
    expect(await snapshot()).toEqual(before);
    expect(await audits()).toHaveLength(1);
  });

  it('returns 404 when restoring activities of another event or unknown ids', async () => {
    const { event, other, foreign } = await fixture();
    const { cookie } = await session('admin', event);
    const otherAdmin = await session('admin', other);
    await archived(other, foreign, otherAdmin.cookie);
    const before = await snapshot();
    for (const id of [foreign, '00000000-0000-4000-8000-000000000000'])
      await restore(event, id).set(headers(cookie)).send({ expectedVersion: 2 }).expect(404);
    expect(await snapshot()).toEqual(before);
    expect(await audits()).toHaveLength(1);
  });

  it('rejects restore from judges, unauthenticated callers, other-event admins and missing CSRF or origin', async () => {
    const { event, other, late } = await fixture();
    const admin = await session('admin', event);
    const judge = await session('judge', event);
    const otherAdmin = await session('admin', other);
    await archived(event, late, admin.cookie);
    const before = await snapshot();
    const command = () => restore(event, late).send({ expectedVersion: 2 });
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
    expect(await snapshot()).toEqual(before);
    expect(await audits()).toHaveLength(1);
  });

  // Database rules keep stored activities placed, so these tests bypass them to model drifted data.
  it('rejects restoring an activity whose venue is no longer attached to the event with 409', async () => {
    const { event, venue, late } = await fixture();
    const { cookie } = await session('admin', event);
    await archived(event, late, cookie);
    await client`ALTER TABLE activities DROP CONSTRAINT activities_event_venue_fk`;
    await client`DELETE FROM event_venues WHERE event_id = ${event} AND venue_id = ${venue}`;
    const before = await snapshot();
    const response = await restore(event, late)
      .set(headers(cookie))
      .send({ expectedVersion: 2 })
      .expect(409);
    expect((response.body as { message: string }).message).toBe(
      'Activity no longer fits its venue or the event window',
    );
    expect(await snapshot()).toEqual(before);
    expect(await audits()).toHaveLength(1);
  });

  it('rejects restoring an activity outside the current event window with 409', async () => {
    const { event, late } = await fixture();
    const { cookie } = await session('admin', event);
    await archived(event, late, cookie);
    await client`ALTER TABLE events DISABLE TRIGGER events_activities_window_ck`;
    await client`UPDATE events SET starts_at = '2026-11-20T00:00:00Z', ends_at = '2026-11-20T17:00:00Z' WHERE id = ${event}`;
    const before = await snapshot();
    const response = await restore(event, late)
      .set(headers(cookie))
      .send({ expectedVersion: 2 })
      .expect(409);
    expect((response.body as { message: string }).message).toBe(
      'Activity no longer fits its venue or the event window',
    );
    expect(await snapshot()).toEqual(before);
    expect(await audits()).toHaveLength(1);
  });

  it('keeps pass access links through archive and restore', async () => {
    const { event, late } = await fixture();
    const { cookie } = await session('admin', event);
    const [{ id: passType }] = await client<{ id: string }[]>`
      INSERT INTO event_pass_types (event_id, name, pass_class, price_cents)
      VALUES (${event}, 'Full', 'full', 1000) RETURNING id`;
    await client`INSERT INTO event_pass_type_activities (event_id, pass_type_id, activity_id, access)
      VALUES (${event}, ${passType}, ${late}, 'selectable')`;
    await archived(event, late, cookie);
    await restore(event, late).set(headers(cookie)).send({ expectedVersion: 2 }).expect(201);
    expect(
      await client`SELECT pass_type_id, activity_id, access FROM event_pass_type_activities WHERE event_id = ${event}`,
    ).toEqual([{ pass_type_id: passType, activity_id: late, access: 'selectable' }]);
  });

  it('rolls back the mutation when the catalog audit fact cannot be written', async () => {
    const { event, early, venue } = await fixture();
    const { cookie } = await session('admin', event);
    const before = await snapshot();
    await client`ALTER TABLE event_catalog_audit ADD CONSTRAINT reject_activity_test CHECK (entity_type <> 'activity') NOT VALID`;
    await create(event).set(headers(cookie)).send(draft(venue)).expect(500);
    await update(event, early)
      .set(headers(cookie))
      .send({ expectedVersion: 1, name: 'Lost' })
      .expect(500);
    await archive(event, early).set(headers(cookie)).send({ expectedVersion: 1 }).expect(500);
    expect(await snapshot()).toEqual(before);
    expect(await audits()).toHaveLength(0);
  });

  it('rolls back the restore when its audit fact cannot be written', async () => {
    const { event, late } = await fixture();
    const { cookie } = await session('admin', event);
    await archived(event, late, cookie);
    const before = await snapshot();
    await client`ALTER TABLE event_catalog_audit ADD CONSTRAINT reject_restore_test CHECK (operation <> 'restore') NOT VALID`;
    await restore(event, late).set(headers(cookie)).send({ expectedVersion: 2 }).expect(500);
    expect(await snapshot()).toEqual(before);
    expect(await audits()).toHaveLength(1);
  });
});
