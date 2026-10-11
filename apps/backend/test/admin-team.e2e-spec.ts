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
import { hashPassword } from '@/identity-access/password-policy';
import { digest } from '@/identity-access/session-access.service';
import { PostgresHarness } from './support/postgres-harness';

jest.setTimeout(120_000);
const origin = 'http://localhost:5173';
// Mutation checks read the variable directly, like the other admin mutation specs.
const mutationOrigin = process.env.AUTH_TRUSTED_ORIGIN ?? origin;
const password = 'SufficientlyStrong1!';

type Session = { id: string; sessionId: string; cookie: string; csrf: string };

// Team API for global administrators (#214 T3): list, invite, regenerate and cancel invitations.
describe('admin team API (e2e)', () => {
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
    const signed = await http()
      .post('/auth/admin/sign-in')
      .set('Origin', origin)
      .send({ email, password })
      .expect(201);
    const cookie = (signed.headers['set-cookie'] as unknown as string[])[0].split(';')[0];
    const [{ id: sessionId }] = await client<{ id: string }[]>`
      SELECT id FROM auth_sessions WHERE user_id = ${id}`;
    return { id, sessionId, cookie, csrf: (signed.body as { csrfToken: string }).csrfToken };
  }

  const globalAdmin = () => member('global@example.test', [{ role: 'admin', scopeType: 'global' }]);

  async function twoEvents() {
    const [{ id: org }] = await client<{ id: string }[]>`
      INSERT INTO organizations (name) VALUES ('Org') RETURNING id`;
    const [zeta, alpha] = await client<{ id: string }[]>`
      INSERT INTO events (organization_id, name, time_zone)
      VALUES (${org}, 'Zeta', 'Etc/UTC'), (${org}, 'Alpha', 'Etc/UTC') RETURNING id`;
    return { zeta: zeta.id, alpha: alpha.id };
  }

  const mutate = (method: 'post' | 'delete', path: string, session: Session, body?: object) => {
    const call = http()
      [method](path)
      .set('Origin', mutationOrigin)
      .set('Cookie', session.cookie)
      .set('X-CSRF-Token', session.csrf);
    return body ? call.send(body) : call;
  };
  const invite = (session: Session, body: object) => mutate('post', '/admin/team', session, body);
  const list = (session: Session) => http().get('/admin/team').set('Cookie', session.cookie);

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

  const tokenOf = (url: string) => url.split('#')[1];

  it('refuses event-scoped admins and judges on every team endpoint', async () => {
    const { alpha } = await twoEvents();
    const scoped = await member('scoped@example.test', [
      { role: 'admin', scopeType: 'event', scopeId: alpha },
    ]);
    const judge = await member('judge@example.test', [{ role: 'judge', scopeType: 'global' }]);
    const target = crypto.randomUUID();
    for (const session of [scoped, judge]) {
      await list(session).expect(401);
      await invite(session, {
        displayName: 'New',
        email: 'new@example.test',
        access: { kind: 'global' },
      }).expect(401);
      await mutate('post', `/admin/team/${target}/invitation`, session).expect(401);
      await mutate('delete', `/admin/team/${target}/invitation`, session).expect(401);
    }
    await http().get('/admin/team').expect(401);
    expect(await client`SELECT id FROM admin_invitations`).toHaveLength(0);
  });

  it('requires the trusted origin and CSRF token on mutations', async () => {
    const admin = await globalAdmin();
    const body = { displayName: 'New', email: 'new@example.test', access: { kind: 'global' } };
    await http()
      .post('/admin/team')
      .set('Origin', mutationOrigin)
      .set('Cookie', admin.cookie)
      .send(body)
      .expect(403);
    await http()
      .post('/admin/team')
      .set('Origin', 'https://attacker.example')
      .set('Cookie', admin.cookie)
      .set('X-CSRF-Token', admin.csrf)
      .send(body)
      .expect(403);
    expect(await client`SELECT id FROM users WHERE email = 'new@example.test'`).toHaveLength(0);
  });

  it('invites a global admin with a one-time link and audits it', async () => {
    const admin = await globalAdmin();
    const before = Date.now();
    const response = await invite(admin, {
      displayName: '  Nueva Admin ',
      email: ' Nueva@Example.TEST ',
      access: { kind: 'global' },
    }).expect(201);
    const body = response.body as { userId: string; activationUrl: string; expiresAt: string };
    expect(response.headers['cache-control']).toBe('no-store');
    expect(body.activationUrl).toMatch(
      new RegExp(`^${readTrustedOrigin(process.env)}/activar-cuenta#[a-f0-9]{64}$`),
    );
    const ttl = new Date(body.expiresAt).getTime() - before;
    expect(ttl).toBeGreaterThan(72 * 3600_000 - 60_000);
    expect(ttl).toBeLessThanOrEqual(72 * 3600_000 + 60_000);

    const [user] = await client<
      { email: string; display_name: string; password_hash: string | null }[]
    >`
      SELECT email, display_name, password_hash FROM users WHERE id = ${body.userId}`;
    expect(user).toEqual({
      email: 'nueva@example.test',
      display_name: 'Nueva Admin',
      password_hash: null,
    });
    const roles = await client`
      SELECT role, scope_type, scope_id FROM user_roles WHERE user_id = ${body.userId}`;
    expect(roles).toEqual([{ role: 'admin', scope_type: 'global', scope_id: null }]);
    const [invitation] = await client<{ token_digest: string; created_by_user_id: string }[]>`
      SELECT token_digest, created_by_user_id FROM admin_invitations WHERE user_id = ${body.userId}`;
    expect(invitation).toEqual({
      token_digest: digest(tokenOf(body.activationUrl)),
      created_by_user_id: admin.id,
    });
    expect(await audit()).toEqual([
      {
        action: 'invited',
        actor_user_id: admin.id,
        actor_session_id: admin.sessionId,
        target_user_id: body.userId,
        reason: null,
        details: { access: { kind: 'global' } },
      },
    ]);
  });

  it('invites an event-scoped admin and validates the events', async () => {
    const admin = await globalAdmin();
    const { zeta, alpha } = await twoEvents();
    const response = await invite(admin, {
      displayName: 'Scoped',
      email: 'scoped@example.test',
      access: { kind: 'events', eventIds: [zeta, alpha] },
    }).expect(201);
    const { userId } = response.body as { userId: string };
    const roles = await client<{ scope_id: string }[]>`
      SELECT scope_id FROM user_roles
      WHERE user_id = ${userId} AND role = 'admin' AND scope_type = 'event' ORDER BY scope_id`;
    expect(roles.map((row) => row.scope_id)).toEqual([zeta, alpha].sort());

    const unknown = await invite(admin, {
      displayName: 'Other',
      email: 'other@example.test',
      access: { kind: 'events', eventIds: [alpha, crypto.randomUUID()] },
    }).expect(400);
    expect(unknown.body).toMatchObject({ fieldErrors: { access: 'unknown_event' } });
    const invalid = await invite(admin, {
      displayName: '',
      email: 'nope',
      access: { kind: 'events', eventIds: [] },
    }).expect(400);
    expect(invalid.body).toMatchObject({
      fieldErrors: { displayName: 'invalid', email: 'invalid', access: 'invalid' },
    });
    expect(await client`SELECT id FROM users WHERE email = 'other@example.test'`).toHaveLength(0);
  });

  it('refuses an email that already has an account with 409', async () => {
    const admin = await globalAdmin();
    await member('judge@example.test', [{ role: 'judge', scopeType: 'global' }]);
    const body = { displayName: 'Again', access: { kind: 'global' } };
    await invite(admin, { ...body, email: 'pending@example.test' }).expect(201);
    for (const email of ['PENDING@example.test', 'global@example.test', 'judge@example.test']) {
      const conflict = await invite(admin, { ...body, email }).expect(409);
      expect(conflict.body).toMatchObject({ code: 'email_in_use' });
    }
    await client`UPDATE users SET active = false WHERE email = 'pending@example.test'`;
    await invite(admin, { ...body, email: 'pending@example.test' }).expect(409);
    expect(await client`SELECT id FROM admin_invitations`).toHaveLength(1);
  });

  it('lists admins with status, access and open invitations', async () => {
    const admin = await globalAdmin();
    const { zeta, alpha } = await twoEvents();
    await member('judge@example.test', [{ role: 'judge', scopeType: 'global' }]);
    const scoped = await member('scoped@example.test', [
      { role: 'admin', scopeType: 'event', scopeId: zeta },
      { role: 'admin', scopeType: 'event', scopeId: alpha },
    ]);
    const off = await member('off@example.test', [{ role: 'admin', scopeType: 'global' }]);
    await client`UPDATE users SET active = false WHERE id = ${off.id}`;
    const pending = (
      await invite(admin, {
        displayName: 'Pending',
        email: 'pending@example.test',
        access: { kind: 'events', eventIds: [alpha] },
      }).expect(201)
    ).body as { userId: string; expiresAt: string };
    const expired = (
      await invite(admin, {
        displayName: 'Expired',
        email: 'expired@example.test',
        access: { kind: 'global' },
      }).expect(201)
    ).body as { userId: string };
    await client`
      UPDATE admin_invitations SET expires_at = now() - interval '1 minute'
      WHERE user_id = ${expired.userId}`;

    const response = await list(admin).expect(200);
    expect(response.headers['cache-control']).toBe('no-store');
    const { members } = response.body as { members: { id: string; email: string }[] };
    expect(members.map((row) => row.email)).toEqual([
      'global@example.test',
      'scoped@example.test',
      'expired@example.test',
      'pending@example.test',
      'off@example.test',
    ]);
    const byId = new Map(members.map((row) => [row.id, row]));
    expect(byId.get(admin.id)).toEqual({
      id: admin.id,
      displayName: 'global',
      email: 'global@example.test',
      status: 'active',
      access: { kind: 'global' },
      invitation: null,
    });
    expect(byId.get(scoped.id)).toMatchObject({
      status: 'active',
      access: {
        kind: 'events',
        events: [
          { id: alpha, name: 'Alpha' },
          { id: zeta, name: 'Zeta' },
        ],
      },
    });
    expect(byId.get(pending.userId)).toMatchObject({
      status: 'pending',
      access: { kind: 'events', events: [{ id: alpha, name: 'Alpha' }] },
      invitation: { expiresAt: pending.expiresAt, expired: false },
    });
    expect(byId.get(expired.userId)).toMatchObject({
      status: 'pending',
      invitation: { expired: true },
    });
    expect(byId.get(off.id)).toMatchObject({ status: 'deactivated', invitation: null });
  });

  it('regenerates a link, replacing the open one, for pending and active members', async () => {
    const admin = await globalAdmin();
    const first = (
      await invite(admin, {
        displayName: 'Pending',
        email: 'pending@example.test',
        access: { kind: 'global' },
      }).expect(201)
    ).body as { userId: string; activationUrl: string };
    const second = (
      await mutate('post', `/admin/team/${first.userId}/invitation`, admin).expect(201)
    ).body as { userId: string; activationUrl: string; expiresAt: string };
    expect(second.userId).toBe(first.userId);
    expect(second.activationUrl).not.toBe(first.activationUrl);
    const invitations = await client<{ token_digest: string; cancelled_at: Date | null }[]>`
      SELECT token_digest, cancelled_at FROM admin_invitations
      WHERE user_id = ${first.userId} ORDER BY created_at, id`;
    expect(invitations).toHaveLength(2);
    expect(invitations.find((row) => row.cancelled_at === null)?.token_digest).toBe(
      digest(tokenOf(second.activationUrl)),
    );

    // An active admin (here the caller themself) can get a recovery link; the password stays
    // valid until the link is used.
    await mutate('post', `/admin/team/${admin.id}/invitation`, admin).expect(201);
    await http()
      .post('/auth/admin/sign-in')
      .set('Origin', origin)
      .send({ email: 'global@example.test', password })
      .expect(201);

    const actions = (await audit()).map((row) => [row.action, row.target_user_id, row.details]);
    expect(actions).toEqual([
      ['invited', first.userId, { access: { kind: 'global' } }],
      ['invitation_regenerated', first.userId, { replacedOpenInvitation: true }],
      ['invitation_regenerated', admin.id, { replacedOpenInvitation: false }],
    ]);
  });

  it('refuses to regenerate for deactivated members and unknown users', async () => {
    const admin = await globalAdmin();
    const off = await member('off@example.test', [{ role: 'admin', scopeType: 'global' }]);
    const judge = await member('judge@example.test', [{ role: 'judge', scopeType: 'global' }]);
    await client`UPDATE users SET active = false WHERE id = ${off.id}`;
    const deactivated = await mutate('post', `/admin/team/${off.id}/invitation`, admin).expect(409);
    expect(deactivated.body).toMatchObject({ code: 'member_deactivated' });
    await mutate('post', `/admin/team/${judge.id}/invitation`, admin).expect(404);
    await mutate('post', `/admin/team/${crypto.randomUUID()}/invitation`, admin).expect(404);
    await mutate('post', '/admin/team/not-a-uuid/invitation', admin).expect(400);
    expect(await client`SELECT id FROM admin_invitations`).toHaveLength(0);
    expect(await audit()).toHaveLength(0);
  });

  it('cancels the open invitation once and audits it', async () => {
    const admin = await globalAdmin();
    const { userId } = (
      await invite(admin, {
        displayName: 'Pending',
        email: 'pending@example.test',
        access: { kind: 'global' },
      }).expect(201)
    ).body as { userId: string };
    expect(
      (await mutate('delete', `/admin/team/${userId}/invitation`, admin).expect(200)).body,
    ).toEqual({ cancelled: true });
    const again = await mutate('delete', `/admin/team/${userId}/invitation`, admin).expect(404);
    expect(again.body).toMatchObject({ code: 'no_open_invitation' });
    await mutate('delete', `/admin/team/${crypto.randomUUID()}/invitation`, admin).expect(404);

    const [{ cancelled_at }] = await client<{ cancelled_at: Date | null }[]>`
      SELECT cancelled_at FROM admin_invitations WHERE user_id = ${userId}`;
    expect(cancelled_at).not.toBeNull();
    const rows = await audit();
    expect(rows.map((row) => row.action)).toEqual(['invited', 'invitation_cancelled']);
    expect(rows[1]).toMatchObject({
      actor_user_id: admin.id,
      actor_session_id: admin.sessionId,
      target_user_id: userId,
      reason: null,
      details: {},
    });
    const { members } = (await list(admin).expect(200)).body as {
      members: { id: string; status: string; invitation: unknown }[];
    };
    expect(members.find((row) => row.id === userId)).toMatchObject({
      status: 'pending',
      invitation: null,
    });
  });

  it('answers two concurrent invitations of the same new email with one 201 and one 409', async () => {
    const admin = await globalAdmin();
    const body = { displayName: 'Twin', email: 'twin@example.test', access: { kind: 'global' } };

    const responses = await Promise.all([invite(admin, body), invite(admin, body)]);

    expect(responses.map((response) => response.status).sort()).toEqual([201, 409]);
    expect(responses.find((response) => response.status === 409)?.body).toMatchObject({
      code: 'email_in_use',
    });
    const users = await client`SELECT id FROM users WHERE email = 'twin@example.test'`;
    expect(users).toHaveLength(1);
  });
});
