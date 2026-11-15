import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { argon2id, hash } from 'argon2';
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
const origin = 'http://localhost:5173';
const cookieName = 'nb_admin_session';

describe('admin session foundation (e2e)', () => {
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

  async function provision(role = 'admin', active = true) {
    const password = 'correct horse battery staple';
    const phc = await hash(password, { type: argon2id });
    const [{ id }] = await client<{ id: string }[]>`
      INSERT INTO users (email, display_name, active, password_hash)
      VALUES ('admin@example.com', 'Admin User', ${active}, ${phc}) RETURNING id
    `;
    await client`INSERT INTO user_roles (user_id, role) VALUES (${id}, ${role})`;
    return { id, password };
  }

  function signIn(password: string, email = 'admin@example.com') {
    return request(app.getHttpServer())
      .post('/auth/admin/sign-in')
      .set('Origin', origin)
      .send({ email, password });
  }

  it('reports globalAdmin false for event-scoped admins and judges (#214)', async () => {
    const { id, password } = await provision('admin');
    await client`UPDATE user_roles SET scope_type = 'event', scope_id = gen_random_uuid() WHERE user_id = ${id}`;
    await client`INSERT INTO user_roles (user_id, role) VALUES (${id}, 'judge')`;
    const signed = await signIn(password).expect(201);
    expect((signed.body as { user: { globalAdmin: boolean } }).user.globalAdmin).toBe(false);
    const cookie = signed.headers['set-cookie'] as unknown as string[];
    const current = await request(app.getHttpServer())
      .get('/auth/session')
      .set('Cookie', cookie)
      .expect(200);
    const user = (current.body as { user: { roles: string[]; globalAdmin: boolean } }).user;
    expect(user.globalAdmin).toBe(false);
    expect([...user.roles].sort()).toEqual(['admin', 'judge']);
  });

  it('creates an opaque session, returns safe details and revokes it on protected sign-out', async () => {
    const { id, password } = await provision();
    const signed = await signIn(password).expect(201);
    const signedBody = signed.body as {
      user: {
        id: string;
        email: string;
        displayName: string;
        roles: string[];
        globalAdmin: boolean;
      };
      csrfToken: string;
    };
    expect(signedBody.user).toEqual({
      id,
      email: 'admin@example.com',
      displayName: 'Admin User',
      roles: ['admin'],
      globalAdmin: true,
    });
    expect(signedBody.csrfToken).toMatch(/^[a-f0-9]{64}$/);
    const cookie = signed.headers['set-cookie'] as unknown as string[];
    expect(cookie).toHaveLength(1);
    expect(cookie[0]).toMatch(/^nb_admin_session=[a-f0-9]{64};/);
    expect(cookie[0]).toContain('HttpOnly');
    expect(cookie[0]).toContain('Secure');
    expect(cookie[0]).toContain('SameSite=Strict');
    const [stored] = await client<{ token_digest: string }[]>`
      SELECT token_digest FROM auth_sessions
    `;
    expect(stored.token_digest).toMatch(/^[a-f0-9]{64}$/);
    expect(cookie[0]).not.toContain(stored.token_digest);
    expect(JSON.stringify(signed.body)).not.toContain(cookieName);
    const current = await request(app.getHttpServer())
      .get('/auth/session')
      .set('Cookie', cookie)
      .expect(200);
    const currentBody = current.body as { user: unknown; expiresAt: string };
    expect(currentBody.user).toEqual(signedBody.user);
    expect(currentBody.expiresAt).toMatch(/^20/);
    expect(current.headers['x-csrf-token']).toBe(signedBody.csrfToken);
    const denied = await request(app.getHttpServer())
      .post('/auth/sign-out')
      .set('Origin', origin)
      .set('Cookie', cookie)
      .expect(403);
    expect((denied.body as { message: string }).message).not.toContain('csrf');
    await request(app.getHttpServer())
      .post('/auth/sign-out')
      .set('Origin', origin)
      .set('Cookie', cookie)
      .set('X-CSRF-Token', signedBody.csrfToken)
      .expect(200)
      .expect((response) => {
        expect(response.headers['set-cookie']).toEqual([
          expect.stringContaining(`${cookieName}=;`),
        ]);
      });
    await request(app.getHttpServer()).get('/auth/session').set('Cookie', cookie).expect(401);
    const audits = await client<
      { action: string }[]
    >`SELECT action FROM auth_audit ORDER BY created_at`;
    expect(audits.map((row) => row.action)).toEqual([
      'session_created',
      'denied',
      'session_revoked',
      'denied',
    ]);
  });

  it('revokes and audits the session a new sign-in replaces in the same browser (#392)', async () => {
    const first = await provision();
    const phc = await hash('second horse battery staple', { type: argon2id });
    const [second] = await client<{ id: string }[]>`
      INSERT INTO users (email, display_name, active, password_hash)
      VALUES ('second@example.com', 'Second Admin', true, ${phc}) RETURNING id
    `;
    await client`INSERT INTO user_roles (user_id, role) VALUES (${second.id}, 'admin')`;
    const firstCookie = (await signIn(first.password).expect(201)).headers[
      'set-cookie'
    ] as unknown as string[];

    const failed = await signIn('wrong', 'second@example.com')
      .set('Cookie', firstCookie)
      .expect(401);
    expect(failed.headers['set-cookie']).toBeUndefined();
    await request(app.getHttpServer()).get('/auth/session').set('Cookie', firstCookie).expect(200);

    const replaced = await signIn('second horse battery staple', 'second@example.com')
      .set('Cookie', firstCookie)
      .expect(201);
    expect((replaced.body as { user: { id: string } }).user.id).toBe(second.id);
    await request(app.getHttpServer()).get('/auth/session').set('Cookie', firstCookie).expect(401);
    const secondCookie = replaced.headers['set-cookie'] as unknown as string[];
    await request(app.getHttpServer()).get('/auth/session').set('Cookie', secondCookie).expect(200);

    const sessions = await client<{ user_id: string; revoked: boolean }[]>`
      SELECT user_id, revoked_at IS NOT NULL AS revoked FROM auth_sessions ORDER BY created_at
    `;
    expect(sessions).toEqual([
      { user_id: first.id, revoked: true },
      { user_id: second.id, revoked: false },
    ]);
    const audits = await client<{ action: string; user_id: string | null }[]>`
      SELECT action, user_id FROM auth_audit ORDER BY created_at, action
    `;
    // Rows written in one transaction share created_at, so the tie breaks by action.
    expect(audits.filter((row) => row.action !== 'denied')).toEqual([
      { action: 'session_created', user_id: first.id },
      { action: 'session_created', user_id: second.id },
      { action: 'session_revoked', user_id: first.id },
    ]);
  });

  it('signs in normally when the presented cookie is already revoked or unknown (#392)', async () => {
    const { id, password } = await provision();
    const stale = `${cookieName}=${'a'.repeat(64)}`;
    await signIn(password).set('Cookie', stale).expect(201);
    const audits = await client<{ action: string }[]>`SELECT action FROM auth_audit`;
    expect(audits.map((row) => row.action)).toEqual(['session_created']);
    const [session] = await client<{ user_id: string; revoked: boolean }[]>`
      SELECT user_id, revoked_at IS NOT NULL AS revoked FROM auth_sessions
    `;
    expect(session).toEqual({ user_id: id, revoked: false });
  });

  it('keeps the presented session when the new identity has no admin role (#392)', async () => {
    const first = await provision();
    const cookie = (await signIn(first.password).expect(201)).headers[
      'set-cookie'
    ] as unknown as string[];
    const phc = await hash('third horse battery staple', { type: argon2id });
    await client`
      INSERT INTO users (email, display_name, active, password_hash)
      VALUES ('norole@example.com', 'No Role', true, ${phc})
    `;
    await signIn('third horse battery staple', 'norole@example.com')
      .set('Cookie', cookie)
      .expect(401);
    await request(app.getHttpServer()).get('/auth/session').set('Cookie', cookie).expect(200);
    const revoked = await client`SELECT 1 FROM auth_audit WHERE action = 'session_revoked'`;
    expect(revoked).toHaveLength(0);
  });

  it('does not revoke or audit an already expired session it replaces (#392)', async () => {
    const { password } = await provision();
    const cookie = (await signIn(password).expect(201)).headers[
      'set-cookie'
    ] as unknown as string[];
    await client`UPDATE auth_sessions SET expires_at = now() - interval '1 minute'`;
    await signIn(password).set('Cookie', cookie).expect(201);
    const sessions = await client<{ revoked: boolean }[]>`
      SELECT revoked_at IS NOT NULL AS revoked FROM auth_sessions ORDER BY created_at
    `;
    expect(sessions).toEqual([{ revoked: false }, { revoked: false }]);
    const revoked = await client`SELECT 1 FROM auth_audit WHERE action = 'session_revoked'`;
    expect(revoked).toHaveLength(0);
  });

  it('denies bad credentials, unknown and inactive identities with the same safe response', async () => {
    const { password } = await provision();
    const bad = await signIn('wrong').expect(401);
    const unknown = await signIn(password, 'missing@example.com').expect(401);
    await client`UPDATE users SET active = false WHERE email = 'admin@example.com'`;
    const inactive = await signIn(password).expect(401);
    expect(bad.body).toEqual(unknown.body);
    expect(bad.body).toEqual(inactive.body);
    expect(bad.headers['set-cookie']).toBeUndefined();
    const audit = await client<{ action: string }[]>`SELECT action FROM auth_audit`;
    expect(audit.map((row) => row.action)).toEqual(['denied', 'denied', 'denied']);
  });

  it('rejects missing and mismatched origins, and non-admin roles', async () => {
    const { password } = await provision('dancer');
    await request(app.getHttpServer())
      .post('/auth/admin/sign-in')
      .send({ email: 'admin@example.com', password })
      .expect(403);
    await request(app.getHttpServer())
      .post('/auth/admin/sign-in')
      .set('Origin', 'https://attacker.example')
      .send({ email: 'admin@example.com', password })
      .expect(403);
    await signIn(password).expect(401);
    const audit = await client<{ action: string }[]>`SELECT action FROM auth_audit`;
    expect(audit).toHaveLength(3);
  });

  it('denies missing, unknown, expired, revoked and suspended sessions safely', async () => {
    const missing = await request(app.getHttpServer()).get('/auth/session').expect(401);
    const invalid = await request(app.getHttpServer())
      .get('/auth/session')
      .set('Cookie', `${cookieName}=${'f'.repeat(64)}`)
      .expect(401);
    expect(missing.body).toEqual(invalid.body);
    const { password } = await provision();
    const signed = await signIn(password).expect(201);
    const cookie = signed.headers['set-cookie'] as unknown as string[];
    await client`UPDATE auth_sessions SET expires_at = now() - interval '1 second'`;
    const expired = await request(app.getHttpServer())
      .get('/auth/session')
      .set('Cookie', cookie)
      .expect(401);
    expect(expired.body).toEqual(missing.body);
    await client`UPDATE auth_sessions SET expires_at = now() + interval '1 hour', revoked_at = now()`;
    await request(app.getHttpServer()).get('/auth/session').set('Cookie', cookie).expect(401);
    await client`UPDATE auth_sessions SET revoked_at = NULL`;
    await client`UPDATE users SET active = false`;
    await request(app.getHttpServer()).get('/auth/session').set('Cookie', cookie).expect(401);
    const audit = await client<
      { action: string }[]
    >`SELECT action FROM auth_audit WHERE action = 'denied'`;
    expect(audit).toHaveLength(5);
  });

  it('requires a matching origin and session-bound CSRF token to sign out', async () => {
    const { password } = await provision();
    const signed = await signIn(password).expect(201);
    const cookie = signed.headers['set-cookie'] as unknown as string[];
    await request(app.getHttpServer())
      .post('/auth/sign-out')
      .set('Cookie', cookie)
      .set('X-CSRF-Token', (signed.body as { csrfToken: string }).csrfToken)
      .expect(403);
    await request(app.getHttpServer())
      .post('/auth/sign-out')
      .set('Origin', 'https://attacker.example')
      .set('Cookie', cookie)
      .set('X-CSRF-Token', (signed.body as { csrfToken: string }).csrfToken)
      .expect(403);
    await request(app.getHttpServer()).get('/auth/session').set('Cookie', cookie).expect(200);
    const other = await signIn(password).expect(201);
    const otherCookie = other.headers['set-cookie'] as unknown as string[];
    await request(app.getHttpServer())
      .post('/auth/sign-out')
      .set('Origin', origin)
      .set('Cookie', otherCookie)
      .set('X-CSRF-Token', (signed.body as { csrfToken: string }).csrfToken)
      .expect(403);
    await request(app.getHttpServer()).get('/auth/session').set('Cookie', otherCookie).expect(200);
    await client`DELETE FROM user_roles`;
    await request(app.getHttpServer()).get('/auth/session').set('Cookie', cookie).expect(401);
  });
});
