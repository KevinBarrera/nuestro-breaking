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
import { PostgresHarness } from './support/postgres-harness';

jest.setTimeout(120_000);
const origin = 'http://localhost:5173';
// Admin mutation checks read the variable directly; public auth routes use `readTrustedOrigin`.
const mutationOrigin = process.env.AUTH_TRUSTED_ORIGIN ?? origin;
const publicOrigin = readTrustedOrigin(process.env);
const password = 'SufficientlyStrong1!';
const newPassword = 'Another-Strong-Pass9';

// Public account activation from an invitation link (#214 T4).
describe('admin account activation (e2e)', () => {
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

  function signIn(email: string, secret: string) {
    return http()
      .post('/auth/admin/sign-in')
      .set('Origin', origin)
      .send({ email, password: secret });
  }

  async function globalAdmin() {
    const [{ id }] = await client<{ id: string }[]>`
      INSERT INTO users (email, display_name, password_hash)
      VALUES ('global@example.test', 'Global', ${await hashPassword(password)}) RETURNING id`;
    await client`INSERT INTO user_roles (user_id, role) VALUES (${id}, 'admin')`;
    const signed = await signIn('global@example.test', password).expect(201);
    const cookie = (signed.headers['set-cookie'] as unknown as string[])[0].split(';')[0];
    return { id, cookie, csrf: (signed.body as { csrfToken: string }).csrfToken };
  }

  async function invite(
    admin: { cookie: string; csrf: string },
    email: string,
    access: object = { kind: 'global' },
  ) {
    const response = await http()
      .post('/admin/team')
      .set('Origin', mutationOrigin)
      .set('Cookie', admin.cookie)
      .set('X-CSRF-Token', admin.csrf)
      .send({ displayName: 'Invitee', email, access })
      .expect(201);
    const body = response.body as { userId: string; activationUrl: string; expiresAt: string };
    return { ...body, token: body.activationUrl.split('#')[1] };
  }

  const check = (token: unknown) =>
    http().post('/auth/activation/check').set('Origin', publicOrigin).send({ token });
  const activate = (token: unknown, secret: unknown = newPassword) =>
    http().post('/auth/activation').set('Origin', publicOrigin).send({ token, password: secret });

  async function activatedAudit() {
    return client<
      { actor_user_id: string; actor_session_id: string | null; target_user_id: string }[]
    >`
      SELECT actor_user_id, actor_session_id, target_user_id
      FROM admin_team_audit WHERE action = 'activated'`;
  }

  it('checks a valid link, activates the account, and leaves sign-in to the user', async () => {
    const admin = await globalAdmin();
    const [{ id: org }] = await client<{ id: string }[]>`
      INSERT INTO organizations (name) VALUES ('Org') RETURNING id`;
    const [mine, other] = await client<{ id: string }[]>`
      INSERT INTO events (organization_id, name, time_zone)
      VALUES (${org}, 'Mine', 'Etc/UTC'), (${org}, 'Other', 'Etc/UTC') RETURNING id`;
    const invitation = await invite(admin, 'scoped@example.test', {
      kind: 'events',
      eventIds: [mine.id],
    });

    const checked = await check(invitation.token).expect(200);
    expect(checked.headers['cache-control']).toBe('no-store');
    expect(checked.body).toEqual({
      displayName: 'Invitee',
      email: 'scoped@example.test',
      expiresAt: invitation.expiresAt,
    });

    const activated = await activate(invitation.token).expect(200);
    expect(activated.body).toEqual({ activated: true });
    expect(activated.headers['set-cookie']).toBeUndefined();
    expect(await activatedAudit()).toEqual([
      {
        actor_user_id: invitation.userId,
        actor_session_id: null,
        target_user_id: invitation.userId,
      },
    ]);
    const [stored] = await client<{ password_hash: string }[]>`
      SELECT password_hash FROM users WHERE id = ${invitation.userId}`;
    expect(stored.password_hash).toMatch(/^\$argon2id\$/);
    expect(JSON.stringify(await client`SELECT * FROM admin_team_audit`)).not.toContain(newPassword);

    const signed = await signIn('scoped@example.test', newPassword).expect(201);
    const cookie = (signed.headers['set-cookie'] as unknown as string[])[0].split(';')[0];
    const events = (await http().get('/admin/events').set('Cookie', cookie).expect(200)).body as {
      id: string;
    }[];
    expect(events.map((event) => event.id)).toEqual([mine.id]);
    expect(events.map((event) => event.id)).not.toContain(other.id);
    await http().get('/admin/team').set('Cookie', cookie).expect(401);
  });

  it('refuses used, cancelled, regenerated, expired and unknown links with one response', async () => {
    const admin = await globalAdmin();
    const used = await invite(admin, 'used@example.test');
    await activate(used.token).expect(200);
    const cancelled = await invite(admin, 'cancelled@example.test');
    await http()
      .delete(`/admin/team/${cancelled.userId}/invitation`)
      .set('Origin', mutationOrigin)
      .set('Cookie', admin.cookie)
      .set('X-CSRF-Token', admin.csrf)
      .expect(200);
    const replaced = await invite(admin, 'replaced@example.test');
    await http()
      .post(`/admin/team/${replaced.userId}/invitation`)
      .set('Origin', mutationOrigin)
      .set('Cookie', admin.cookie)
      .set('X-CSRF-Token', admin.csrf)
      .expect(201);
    const expired = await invite(admin, 'expired@example.test');
    await client`
      UPDATE admin_invitations SET expires_at = now() - interval '1 second'
      WHERE user_id = ${expired.userId}`;
    const deactivated = await invite(admin, 'off@example.test');
    await client`UPDATE users SET active = false WHERE id = ${deactivated.userId}`;

    const tokens = [
      used.token,
      cancelled.token,
      replaced.token,
      expired.token,
      deactivated.token,
      'f'.repeat(64),
      'not-a-token',
    ];
    const reference = (await check('f'.repeat(64)).expect(410)).body as unknown;
    expect(reference).toEqual({
      statusCode: 410,
      message: 'Invalid or expired link',
      code: 'invalid_link',
    });
    for (const token of tokens) {
      expect((await check(token).expect(410)).body).toEqual(reference);
      expect((await activate(token).expect(410)).body).toEqual(reference);
    }
    const passwords = await client<{ email: string }[]>`
      SELECT email FROM users WHERE password_hash IS NOT NULL ORDER BY email`;
    expect(passwords.map((row) => row.email)).toEqual(['global@example.test', 'used@example.test']);
    expect(await activatedAudit()).toHaveLength(1);
  });

  it('refuses a weak password with the failed rule ids and keeps the link open', async () => {
    const admin = await globalAdmin();
    const invitation = await invite(admin, 'weak@example.test');
    const weak = await activate(invitation.token, 'short').expect(400);
    expect(weak.body).toMatchObject({
      message: 'Weak password',
      failedRules: ['min_length', 'uppercase', 'digit', 'symbol'],
    });
    expect(JSON.stringify(weak.body)).not.toContain('short"');
    await activate(invitation.token, 42).expect(400);
    await http()
      .post('/auth/activation')
      .set('Origin', publicOrigin)
      .send({ token: invitation.token })
      .expect(400);
    await check(invitation.token).expect(200);
    await activate(invitation.token).expect(200);
  });

  it('revokes existing sessions when an active admin uses a recovery link', async () => {
    const admin = await globalAdmin();
    const recovery = (
      await http()
        .post(`/admin/team/${admin.id}/invitation`)
        .set('Origin', mutationOrigin)
        .set('Cookie', admin.cookie)
        .set('X-CSRF-Token', admin.csrf)
        .expect(201)
    ).body as { activationUrl: string };
    await activate(recovery.activationUrl.split('#')[1]).expect(200);
    await http().get('/auth/session').set('Cookie', admin.cookie).expect(401);
    await signIn('global@example.test', password).expect(401);
    await signIn('global@example.test', newPassword).expect(201);
  });

  it('lets exactly one of two concurrent activations with the same link succeed', async () => {
    const admin = await globalAdmin();
    const invitation = await invite(admin, 'race@example.test');

    const responses = await Promise.all([activate(invitation.token), activate(invitation.token)]);

    expect(responses.map((response) => response.status).sort()).toEqual([200, 410]);
    expect(responses.find((response) => response.status === 410)?.body).toMatchObject({
      code: 'invalid_link',
    });
    expect(await activatedAudit()).toHaveLength(1);
  });

  it('serializes a recovery link regeneration racing an activation without errors', async () => {
    const admin = await globalAdmin();
    const invitation = await invite(admin, 'regen-race@example.test');

    const [activated, regenerated] = await Promise.all([
      activate(invitation.token),
      http()
        .post(`/admin/team/${invitation.userId}/invitation`)
        .set('Origin', mutationOrigin)
        .set('Cookie', admin.cookie)
        .set('X-CSRF-Token', admin.csrf),
    ]);

    // Either order is valid; a deadlock or lock error would surface as a 500.
    expect([200, 410]).toContain(activated.status);
    expect(regenerated.status).toBe(201);
  });

  it('requires the trusted origin on public activation requests', async () => {
    const admin = await globalAdmin();
    const invitation = await invite(admin, 'origin@example.test');
    for (const path of ['/auth/activation/check', '/auth/activation']) {
      await http()
        .post(path)
        .set('Origin', 'https://attacker.example')
        .send({ token: invitation.token, password: newPassword })
        .expect(403);
      await http().post(path).send({ token: invitation.token, password: newPassword }).expect(403);
    }
    await check(invitation.token).expect(200);
  });
});
