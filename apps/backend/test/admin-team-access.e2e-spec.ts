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
import { ADMIN_TEAM_LOCK_KEY } from '@/identity-access/admin-team.service';
import { hashPassword } from '@/identity-access/password-policy';
import { PostgresHarness } from './support/postgres-harness';

jest.setTimeout(120_000);
const origin = 'http://localhost:5173';
// Mutation checks read the variable directly, like the other admin mutation specs.
const mutationOrigin = readTrustedOrigin(process.env);
const password = 'SufficientlyStrong1!';
const LOCK_WAIT_LIMIT_MS = 5_000;

type Session = { id: string; email: string; sessionId: string; cookie: string; csrf: string };
type Method = 'post' | 'put';

// Access changes for global administrators (#214 T5): change scope, deactivate and reactivate.
describe('admin team access changes (e2e)', () => {
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

  const http = () => request(app.getHttpServer());

  const signIn = (email: string) =>
    http().post('/auth/admin/sign-in').set('Origin', origin).send({ email, password });

  async function member(
    email: string,
    roles: { role: string; scopeType: string; scopeId?: string }[],
  ): Promise<Session> {
    const [{ id }] = await client<{ id: string }[]>`
      INSERT INTO users (email, display_name, password_hash)
      VALUES (${email}, ${email.split('@')[0]}, ${await hashPassword(password)}) RETURNING id`;
    for (const role of roles)
      await client`
        INSERT INTO user_roles (user_id, role, scope_type, scope_id)
        VALUES (${id}, ${role.role}, ${role.scopeType}, ${role.scopeId ?? null})`;
    const signed = await signIn(email).expect(201);
    const cookie = (signed.headers['set-cookie'] as unknown as string[])[0].split(';')[0];
    const [{ id: sessionId }] = await client<{ id: string }[]>`
      SELECT id FROM auth_sessions WHERE user_id = ${id}`;
    return { id, email, sessionId, cookie, csrf: (signed.body as { csrfToken: string }).csrfToken };
  }

  const global = (name: string) =>
    member(`${name}@example.test`, [{ role: 'admin', scopeType: 'global' }]);

  async function twoEvents() {
    const [{ id: org }] = await client<{ id: string }[]>`
      INSERT INTO organizations (name) VALUES ('Org') RETURNING id`;
    const [first, second] = await client<{ id: string }[]>`
      INSERT INTO events (organization_id, name, time_zone)
      VALUES (${org}, 'First', 'Etc/UTC'), (${org}, 'Second', 'Etc/UTC') RETURNING id`;
    return { first: first.id, second: second.id };
  }

  const mutate = (method: Method, path: string, session: Session, body?: object) => {
    const call = http()
      [method](path)
      .set('Origin', mutationOrigin)
      .set('Cookie', session.cookie)
      .set('X-CSRF-Token', session.csrf);
    return body ? call.send(body) : call;
  };
  const changeAccess = (session: Session, userId: string, body: object) =>
    mutate('put', `/admin/team/${userId}/access`, session, body);
  const deactivate = (session: Session, userId: string, body: object = { reason: 'Left' }) =>
    mutate('post', `/admin/team/${userId}/deactivate`, session, body);
  const reactivate = (session: Session, userId: string, body: object = {}) =>
    mutate('post', `/admin/team/${userId}/reactivate`, session, body);
  const passTypes = (session: Session, eventId: string) =>
    http().get(`/admin/events/${eventId}/pass-types`).set('Cookie', session.cookie);

  async function audit() {
    return client<
      {
        action: string;
        actor_user_id: string;
        actor_session_id: string;
        target_user_id: string;
        reason: string | null;
        details: unknown;
      }[]
    >`SELECT action, actor_user_id, actor_session_id, target_user_id, reason, details
      FROM admin_team_audit ORDER BY created_at, id`;
  }

  /** Activated users with an active global admin role: the ones the last-admin rule counts. */
  async function activeGlobalAdmins() {
    const rows = await client<{ id: string }[]>`
      SELECT DISTINCT u.id FROM users u JOIN user_roles r ON r.user_id = u.id
      WHERE u.active AND u.password_hash IS NOT NULL AND r.role = 'admin'
        AND r.scope_type = 'global' AND r.active AND r.revoked_at IS NULL`;
    return rows.map((row) => row.id);
  }

  /**
   * Supertest builds requests lazily: nothing is sent until something calls `.then`. This sends the
   * request now and returns a plain promise of its response.
   */
  const dispatch = (call: request.Test): Promise<request.Response> =>
    call.then((response) => response);

  /**
   * Holds the service's team lock while `start` dispatches requests, waits until every one of them
   * passed authorization and is blocked on the lock, runs `whileBlocked`, then releases the lock.
   * Fails fast, with the statuses, if a request finishes before it ever waits on the lock.
   */
  async function overlapOnTeamLock(
    start: () => Promise<request.Response>[],
    whileBlocked: () => Promise<unknown> = () => Promise.resolve(),
  ): Promise<request.Response[]> {
    let settled: Promise<request.Response[]> = Promise.resolve([]);
    await client.begin(async (tx) => {
      await tx`SELECT pg_advisory_xact_lock(${ADMIN_TEAM_LOCK_KEY})`;
      const requests = start();
      settled = Promise.all(requests);
      let early: string | undefined;
      settled.then(
        (responses) => {
          early = `requests finished before waiting on the team lock: ${responses
            .map((response) => `${response.status} ${JSON.stringify(response.body)}`)
            .join('; ')}`;
        },
        (error: unknown) => {
          early = `a request failed before waiting on the team lock: ${String(error)}`;
        },
      );
      const deadline = Date.now() + LOCK_WAIT_LIMIT_MS;
      for (;;) {
        if (early) throw new Error(early);
        const [{ waiting }] = await tx<{ waiting: number }[]>`
          SELECT count(*)::int AS waiting FROM pg_locks
          WHERE locktype = 'advisory' AND objid = ${ADMIN_TEAM_LOCK_KEY} AND NOT granted`;
        if (waiting === requests.length) break;
        if (Date.now() > deadline)
          throw new Error(
            `only ${waiting} of ${requests.length} requests waited on the team lock within ${LOCK_WAIT_LIMIT_MS} ms`,
          );
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      await whileBlocked();
    });
    return settled;
  }

  async function deniedCount() {
    const [{ count }] = await client<{ count: number }[]>`
      SELECT count(*)::int AS count FROM auth_audit WHERE action = 'denied'`;
    return count;
  }

  it('refuses event-scoped admins, judges and anonymous callers on every endpoint', async () => {
    const { first } = await twoEvents();
    const target = await global('target');
    const scoped = await member('scoped@example.test', [
      { role: 'admin', scopeType: 'event', scopeId: first },
    ]);
    const judge = await member('judge@example.test', [{ role: 'judge', scopeType: 'global' }]);
    for (const session of [scoped, judge]) {
      await changeAccess(session, target.id, {
        access: { kind: 'events', eventIds: [first] },
      }).expect(401);
      await deactivate(session, target.id).expect(401);
      await reactivate(session, target.id).expect(401);
    }
    for (const path of ['deactivate', 'reactivate'])
      await http()
        .post(`/admin/team/${target.id}/${path}`)
        .set('Origin', mutationOrigin)
        .expect(401);
    await http()
      .put(`/admin/team/${target.id}/access`)
      .set('Origin', mutationOrigin)
      .send({ access: { kind: 'global' } })
      .expect(401);
    expect(await activeGlobalAdmins()).toEqual([target.id]);
    expect(await audit()).toHaveLength(0);
  });

  it('requires the CSRF token and trusted origin on every endpoint', async () => {
    const admin = await global('admin');
    const target = await global('target');
    const calls: [Method, string, object][] = [
      ['put', 'access', { access: { kind: 'global' } }],
      ['post', 'deactivate', { reason: 'Left' }],
      ['post', 'reactivate', {}],
    ];
    for (const [method, path, body] of calls) {
      await http()
        [method](`/admin/team/${target.id}/${path}`)
        .set('Origin', mutationOrigin)
        .set('Cookie', admin.cookie)
        .send(body)
        .expect(403);
      await http()
        [method](`/admin/team/${target.id}/${path}`)
        .set('Origin', 'https://attacker.example')
        .set('Cookie', admin.cookie)
        .set('X-CSRF-Token', admin.csrf)
        .send(body)
        .expect(403);
    }
    expect(await activeGlobalAdmins()).toHaveLength(2);
    expect(await audit()).toHaveLength(0);
  });

  it('changes scope live: the target keeps its session and sees the new scope next request', async () => {
    const admin = await global('admin');
    const { first, second } = await twoEvents();
    const scoped = await member('scoped@example.test', [
      { role: 'admin', scopeType: 'event', scopeId: first },
    ]);
    await passTypes(scoped, first).expect(200);
    await passTypes(scoped, second).expect(401);

    const moved = await changeAccess(admin, scoped.id, {
      access: { kind: 'events', eventIds: [second] },
      reason: ' Moved to the second event ',
    }).expect(200);
    expect(moved.body).toEqual({ changed: true });

    await passTypes(scoped, first).expect(401);
    await passTypes(scoped, second).expect(200);
    const roles = await client<{ scope_id: string; active: boolean; revoked: boolean }[]>`
      SELECT scope_id, active, revoked_at IS NOT NULL AS revoked FROM user_roles
      WHERE user_id = ${scoped.id} ORDER BY approved_at, id`;
    expect(roles).toEqual([
      { scope_id: first, active: false, revoked: true },
      { scope_id: second, active: true, revoked: false },
    ]);

    // The same access again changes nothing and is not audited.
    expect(
      (
        await changeAccess(admin, scoped.id, {
          access: { kind: 'events', eventIds: [second] },
        }).expect(200)
      ).body,
    ).toEqual({ changed: false });
    await changeAccess(admin, scoped.id, { access: { kind: 'global' } }).expect(200);
    await passTypes(scoped, first).expect(200);
    const unknown = await changeAccess(admin, scoped.id, {
      access: { kind: 'events', eventIds: [crypto.randomUUID()] },
    }).expect(400);
    expect(unknown.body).toMatchObject({ fieldErrors: { access: 'unknown_event' } });
    await changeAccess(admin, scoped.id, { access: { kind: 'nope' } }).expect(400);
    await changeAccess(admin, crypto.randomUUID(), { access: { kind: 'global' } }).expect(404);

    expect(await audit()).toEqual([
      {
        action: 'scope_changed',
        actor_user_id: admin.id,
        actor_session_id: admin.sessionId,
        target_user_id: scoped.id,
        reason: 'Moved to the second event',
        details: {
          from: { kind: 'events', eventIds: [first] },
          to: { kind: 'events', eventIds: [second] },
        },
      },
      {
        action: 'scope_changed',
        actor_user_id: admin.id,
        actor_session_id: admin.sessionId,
        target_user_id: scoped.id,
        reason: null,
        details: { from: { kind: 'events', eventIds: [second] }, to: { kind: 'global' } },
      },
    ]);
  });

  it('refuses changing your own access and removing the last activated global admin', async () => {
    const admin = await global('admin');
    const other = await global('other');
    const { first } = await twoEvents();
    const self = await changeAccess(admin, admin.id, {
      access: { kind: 'events', eventIds: [first] },
    }).expect(409);
    expect(self.body).toMatchObject({ code: 'self_change' });
    const selfOff = await deactivate(admin, admin.id).expect(409);
    expect(selfOff.body).toMatchObject({ code: 'self_deactivation' });
    // The route accepts any UUID spelling; an uppercased own id is still the caller.
    const upper = admin.id.toUpperCase();
    const selfUpper = await changeAccess(admin, upper, {
      access: { kind: 'events', eventIds: [first] },
    }).expect(409);
    expect(selfUpper.body).toMatchObject({ code: 'self_change' });
    const selfOffUpper = await deactivate(admin, upper).expect(409);
    expect(selfOffUpper.body).toMatchObject({ code: 'self_deactivation' });

    // Only activated admins count: with the caller's password cleared, `other` is the last one.
    await client`UPDATE users SET password_hash = NULL WHERE id = ${admin.id}`;
    const scope = await changeAccess(admin, other.id, {
      access: { kind: 'events', eventIds: [first] },
    }).expect(409);
    expect(scope.body).toMatchObject({ code: 'last_global_admin' });
    const off = await deactivate(admin, other.id).expect(409);
    expect(off.body).toMatchObject({ code: 'last_global_admin' });

    expect(await activeGlobalAdmins()).toEqual([other.id]);
    expect(await audit()).toHaveLength(0);
  });

  it('deactivates at once: sessions revoked, sign-in refused, open link cancelled, audited', async () => {
    const admin = await global('admin');
    const target = await global('target');
    const second = (await signIn(target.email).expect(201)).headers[
      'set-cookie'
    ] as unknown as string[];
    await mutate('post', `/admin/team/${target.id}/invitation`, admin).expect(201);

    await deactivate(admin, target.id, {}).expect(400);
    await deactivate(admin, target.id, { reason: 'x'.repeat(501) }).expect(400);
    const response = await deactivate(admin, target.id, { reason: '  Left the team ' }).expect(200);
    expect(response.body).toEqual({ status: 'deactivated' });

    await http().get('/auth/session').set('Cookie', target.cookie).expect(401);
    await http().get('/auth/session').set('Cookie', second[0].split(';')[0]).expect(401);
    await signIn(target.email).expect(401);
    const sessions = await client<{ revoked: boolean }[]>`
      SELECT revoked_at IS NOT NULL AS revoked FROM auth_sessions WHERE user_id = ${target.id}`;
    expect(sessions).toEqual([{ revoked: true }, { revoked: true }]);
    expect(
      await client`SELECT id FROM admin_invitations
        WHERE user_id = ${target.id} AND used_at IS NULL AND cancelled_at IS NULL`,
    ).toHaveLength(0);
    // Deactivation keeps the admin role, so reactivation restores the same access.
    expect(
      await client`SELECT id FROM user_roles WHERE user_id = ${target.id} AND active`,
    ).toHaveLength(1);

    const again = await deactivate(admin, target.id).expect(409);
    expect(again.body).toMatchObject({ code: 'member_deactivated' });
    await deactivate(admin, crypto.randomUUID()).expect(404);

    const rows = await audit();
    expect(rows.map((row) => row.action)).toEqual(['invitation_regenerated', 'deactivated']);
    expect(rows[1]).toEqual({
      action: 'deactivated',
      actor_user_id: admin.id,
      actor_session_id: admin.sessionId,
      target_user_id: target.id,
      reason: 'Left the team',
      details: { revokedSessions: 2, cancelledInvitation: true },
    });
  });

  it('keeps at least one global admin when two deactivate each other at the same time', async () => {
    const left = await global('left');
    const right = await global('right');

    // Both requests pass authorization and then wait on the team lock, so they truly overlap
    // instead of running one after the other. The one that runs second finds its caller already
    // deactivated by the first and is refused as unauthenticated.
    const responses = await overlapOnTeamLock(() => [
      dispatch(deactivate(left, right.id, { reason: 'Race' })),
      dispatch(deactivate(right, left.id, { reason: 'Race' })),
    ]);

    expect(responses.map((response) => response.status).sort()).toEqual([200, 401]);
    expect(await activeGlobalAdmins()).toHaveLength(1);
    expect((await audit()).filter((row) => row.action === 'deactivated')).toHaveLength(1);
  });

  it('keeps at least one activated global admin when two removals overlap', async () => {
    const admin = await global('admin');
    const left = await global('left');
    const right = await global('right');
    const { first } = await twoEvents();
    // The caller keeps its session but is not activated, so only `left` and `right` count.
    await client`UPDATE users SET password_hash = NULL WHERE id = ${admin.id}`;

    const responses = await overlapOnTeamLock(() => [
      dispatch(deactivate(admin, left.id, { reason: 'Race' })),
      dispatch(changeAccess(admin, right.id, { access: { kind: 'events', eventIds: [first] } })),
    ]);

    expect(responses.map((response) => response.status).sort()).toEqual([200, 409]);
    expect(responses.find((response) => response.status === 409)?.body).toMatchObject({
      code: 'last_global_admin',
    });
    expect(await activeGlobalAdmins()).toHaveLength(1);
    expect(await audit()).toHaveLength(1);
  });

  it('re-grants an event scope that was revoked earlier', async () => {
    const admin = await global('admin');
    const { first, second } = await twoEvents();
    const scoped = await member('scoped@example.test', [
      { role: 'admin', scopeType: 'event', scopeId: first },
    ]);
    for (const eventId of [second, first])
      expect(
        (
          await changeAccess(admin, scoped.id, {
            access: { kind: 'events', eventIds: [eventId] },
          }).expect(200)
        ).body,
      ).toEqual({ changed: true });

    await passTypes(scoped, first).expect(200);
    await passTypes(scoped, second).expect(401);
    const active = await client<{ scope_id: string }[]>`
      SELECT scope_id FROM user_roles WHERE user_id = ${scoped.id} AND active`;
    expect(active).toEqual([{ scope_id: first }]);
  });

  it('refuses with 401 and changes nothing when the caller lost global access while waiting', async () => {
    const admin = await global('admin');
    await global('keeper');
    const { first } = await twoEvents();
    const target = await global('target');
    const scoped = await member('scoped@example.test', [
      { role: 'admin', scopeType: 'event', scopeId: first },
    ]);
    const off = await global('off');
    await deactivate(admin, off.id).expect(200);
    const auditBefore = await audit();
    const deniedBefore = await deniedCount();

    // The caller's global role is revoked after authorization, while every call waits on the lock.
    const responses = await overlapOnTeamLock(
      () => [
        dispatch(deactivate(admin, target.id)),
        dispatch(changeAccess(admin, scoped.id, { access: { kind: 'global' } })),
        dispatch(reactivate(admin, off.id)),
        dispatch(mutate('post', `/admin/team/${scoped.id}/invitation`, admin)),
        dispatch(
          mutate('post', '/admin/team', admin, {
            displayName: 'New',
            email: 'new@example.test',
            access: { kind: 'global' },
          }),
        ),
      ],
      () => client`
        UPDATE user_roles SET active = false, revoked_at = now()
        WHERE user_id = ${admin.id} AND scope_type = 'global'`,
    );
    expect(responses.map((response) => response.status)).toEqual([401, 401, 401, 401, 401]);

    // A caller deactivated while waiting is refused the same way.
    const keeper = await signIn('keeper@example.test').expect(201);
    const keeperSession: Session = {
      id: (
        await client<{ id: string }[]>`SELECT id FROM users WHERE email = 'keeper@example.test'`
      )[0].id,
      email: 'keeper@example.test',
      sessionId: '',
      cookie: (keeper.headers['set-cookie'] as unknown as string[])[0].split(';')[0],
      csrf: (keeper.body as { csrfToken: string }).csrfToken,
    };
    const [deactivated] = await overlapOnTeamLock(
      () => [dispatch(deactivate(keeperSession, target.id))],
      () => client`UPDATE users SET active = false WHERE id = ${keeperSession.id}`,
    );
    expect(deactivated.status).toBe(401);

    expect(await audit()).toEqual(auditBefore);
    expect(await deniedCount()).toBe(deniedBefore + 6);
    expect(
      await client`SELECT id FROM users WHERE id IN (${target.id}, ${off.id}) AND active`,
    ).toEqual([{ id: target.id }]);
    expect(
      await client`SELECT scope_type FROM user_roles WHERE user_id = ${scoped.id} AND active`,
    ).toEqual([{ scope_type: 'event' }]);
    expect(await client`SELECT id FROM users WHERE email = 'new@example.test'`).toHaveLength(0);
    expect(
      await client`SELECT id FROM admin_invitations WHERE user_id = ${scoped.id}`,
    ).toHaveLength(0);
  });

  it('reactivates: the old password works again, a never-activated member is pending again', async () => {
    const admin = await global('admin');
    const target = await global('target');
    await deactivate(admin, target.id).expect(200);
    const active = await reactivate(admin, target.id, { reason: 'Back' }).expect(200);
    expect(active.body).toEqual({ status: 'active' });
    await signIn(target.email).expect(201);
    const again = await reactivate(admin, target.id).expect(409);
    expect(again.body).toMatchObject({ code: 'member_active' });
    await reactivate(admin, admin.id).expect(409);

    const { userId } = (
      await mutate('post', '/admin/team', admin, {
        displayName: 'Pending',
        email: 'pending@example.test',
        access: { kind: 'global' },
      }).expect(201)
    ).body as { userId: string };
    await deactivate(admin, userId).expect(200);
    const pending = await reactivate(admin, userId).expect(200);
    expect(pending.body).toEqual({ status: 'pending' });
    await mutate('post', `/admin/team/${userId}/invitation`, admin).expect(201);

    const rows = (await audit()).filter((row) => row.action === 'reactivated');
    expect(rows).toEqual([
      {
        action: 'reactivated',
        actor_user_id: admin.id,
        actor_session_id: admin.sessionId,
        target_user_id: target.id,
        reason: 'Back',
        details: { status: 'active' },
      },
      {
        action: 'reactivated',
        actor_user_id: admin.id,
        actor_session_id: admin.sessionId,
        target_user_id: userId,
        reason: null,
        details: { status: 'pending' },
      },
    ]);
  });
});
