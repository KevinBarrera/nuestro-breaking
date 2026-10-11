import { ForbiddenException, INestApplication, UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { drizzle } from 'drizzle-orm/postgres-js';
import type { Request, Response } from 'express';
import { type Sql } from 'postgres';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '@/app.module';
import { DATABASE_CLIENT } from '@/database/database.constants';
import * as schema from '@/database/schema';
import { DatabaseService } from '@/database/database.service';
import { hashPassword } from '@/identity-access/password-policy';
import { SessionAccessService } from '@/identity-access/session-access.service';
import { PostgresHarness } from './support/postgres-harness';

jest.setTimeout(120_000);
const origin = 'http://localhost:5173';
// Mutation checks read the variable directly, like the other admin mutation specs.
const mutationOrigin = process.env.AUTH_TRUSTED_ORIGIN ?? origin;
const password = 'SufficientlyStrong1!';

// Foundation for admin team management (#214 T1): invitation and team audit tables, the
// global-admin-only access check, and sign-in refusal for accounts without a password.
describe('admin team foundation (e2e)', () => {
  const harness = new PostgresHarness();
  let client: Sql;
  let app: INestApplication<App>;
  let access: SessionAccessService;

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
    access = app.get(SessionAccessService);
  });
  beforeEach(async () => harness.reset());
  afterAll(async () => {
    await app?.close();
    await harness.stop();
  });

  async function user(email: string, passwordHash: string | null = null) {
    const [{ id }] = await client<{ id: string }[]>`
      INSERT INTO users (email, display_name, password_hash)
      VALUES (${email}, 'Team Member', ${passwordHash}) RETURNING id`;
    return id;
  }

  async function member(email: string, role: string, scopeType: string, scopeId: string | null) {
    const id = await user(email, await hashPassword(password));
    await client`
      INSERT INTO user_roles (user_id, role, scope_type, scope_id)
      VALUES (${id}, ${role}, ${scopeType}, ${scopeId})`;
    const signed = await request(app.getHttpServer())
      .post('/auth/admin/sign-in')
      .set('Origin', origin)
      .send({ email, password })
      .expect(201);
    const cookie = (signed.headers['set-cookie'] as unknown as string[])[0].split(';')[0];
    const [{ id: sessionId }] = await client<{ id: string }[]>`
      SELECT id FROM auth_sessions WHERE user_id = ${id}`;
    return { id, sessionId, cookie, csrf: (signed.body as { csrfToken: string }).csrfToken };
  }

  function fakeRequest(cookie: string, headers: { origin?: string; csrf?: string } = {}) {
    return {
      headers: { cookie, origin: headers.origin },
      header: (name: string) => (name.toLowerCase() === 'x-csrf-token' ? headers.csrf : undefined),
    } as unknown as Request;
  }
  const fakeResponse = () => ({ clearCookie: jest.fn() }) as unknown as Response;

  async function deniedCount() {
    const [{ count }] = await client<{ count: number }[]>`
      SELECT count(*)::int AS count FROM auth_audit WHERE action = 'denied'`;
    return count;
  }

  async function invitation(userId: string, createdBy: string, digest: string) {
    return client`
      INSERT INTO admin_invitations (user_id, token_digest, expires_at, created_by_user_id)
      VALUES (${userId}, ${digest}, now() + interval '72 hours', ${createdBy})`;
  }

  const violation = (code: string, constraint: string) => ({ code, constraint_name: constraint });

  it('applies migration 0020 with explicitly named constraints', async () => {
    const constraints = await client<{ name: string }[]>`
      SELECT conname AS name FROM pg_constraint
      WHERE conrelid IN ('admin_invitations'::regclass, 'admin_team_audit'::regclass)
      ORDER BY conname`;
    expect(constraints.map((row) => row.name)).toEqual([
      'admin_invitations_created_by_fk',
      'admin_invitations_pk',
      'admin_invitations_state_ck',
      'admin_invitations_token_digest_ck',
      'admin_invitations_token_digest_uq',
      'admin_invitations_user_fk',
      'admin_team_audit_action_ck',
      'admin_team_audit_actor_ck',
      'admin_team_audit_actor_fk',
      'admin_team_audit_pk',
      'admin_team_audit_session_fk',
      'admin_team_audit_target_fk',
    ]);
    const indexes = await client<{ name: string }[]>`
      SELECT indexname AS name FROM pg_indexes
      WHERE tablename IN ('admin_invitations', 'admin_team_audit') ORDER BY indexname`;
    expect(indexes.map((row) => row.name)).toEqual([
      'admin_invitations_open_user_uq',
      'admin_invitations_pk',
      'admin_invitations_token_digest_uq',
      'admin_team_audit_pk',
      'admin_team_audit_target_created_idx',
    ]);
  });

  it('allows one open invitation per user and enforces invitation state', async () => {
    const creator = await user('creator@example.test');
    const invitee = await user('invitee@example.test');
    await invitation(invitee, creator, 'a'.repeat(64));
    await expect(invitation(invitee, creator, 'b'.repeat(64))).rejects.toMatchObject(
      violation('23505', 'admin_invitations_open_user_uq'),
    );
    await client`UPDATE admin_invitations SET cancelled_at = now()`;
    await invitation(invitee, creator, 'b'.repeat(64));
    await expect(
      client`UPDATE admin_invitations SET used_at = now(), cancelled_at = now()`,
    ).rejects.toMatchObject(violation('23514', 'admin_invitations_state_ck'));
    await expect(invitation(creator, creator, 'b'.repeat(64))).rejects.toMatchObject(
      violation('23505', 'admin_invitations_token_digest_uq'),
    );
    await expect(invitation(creator, creator, 'raw-token')).rejects.toMatchObject(
      violation('23514', 'admin_invitations_token_digest_ck'),
    );
  });

  it('enforces audit actions and their actors', async () => {
    const admin = await member('global@example.test', 'admin', 'global', null);
    const target = await user('target@example.test');
    const audit = (action: string, actor: string | null, session: string | null) => client`
      INSERT INTO admin_team_audit (action, actor_user_id, actor_session_id, target_user_id)
      VALUES (${action}, ${actor}, ${session}, ${target})`;
    await audit('invited', admin.id, admin.sessionId);
    await audit('bootstrapped', null, null);
    await audit('activated', target, null);
    await expect(audit('renamed', admin.id, admin.sessionId)).rejects.toMatchObject(
      violation('23514', 'admin_team_audit_action_ck'),
    );
    await expect(audit('invited', null, null)).rejects.toMatchObject(
      violation('23514', 'admin_team_audit_actor_ck'),
    );
    await expect(audit('deactivated', admin.id, null)).rejects.toMatchObject(
      violation('23514', 'admin_team_audit_actor_ck'),
    );
    await expect(audit('bootstrapped', admin.id, admin.sessionId)).rejects.toMatchObject(
      violation('23514', 'admin_team_audit_actor_ck'),
    );
    await expect(audit('activated', admin.id, null)).rejects.toMatchObject(
      violation('23514', 'admin_team_audit_actor_ck'),
    );
    const [row] = await client<{ details: unknown }[]>`
      SELECT details FROM admin_team_audit WHERE action = 'invited'`;
    expect(row.details).toEqual({});
  });

  it('authorizes only active global admins for team management', async () => {
    const global = await member('global@example.test', 'admin', 'global', null);
    const scoped = await member('scoped@example.test', 'admin', 'event', crypto.randomUUID());
    const judge = await member('judge@example.test', 'judge', 'global', null);

    await expect(
      access.authorizeGlobalAdmin(fakeRequest(global.cookie), fakeResponse()),
    ).resolves.toEqual({ userId: global.id, sessionId: global.sessionId });
    await expect(
      access.authorizeGlobalAdminMutation(
        fakeRequest(global.cookie, { origin: mutationOrigin, csrf: global.csrf }),
        fakeResponse(),
      ),
    ).resolves.toEqual({ userId: global.id, sessionId: global.sessionId });

    const before = await deniedCount();
    for (const denied of [scoped, judge]) {
      await expect(
        access.authorizeGlobalAdmin(fakeRequest(denied.cookie), fakeResponse()),
      ).rejects.toBeInstanceOf(UnauthorizedException);
      await expect(
        access.authorizeGlobalAdminMutation(
          fakeRequest(denied.cookie, { origin: mutationOrigin, csrf: denied.csrf }),
          fakeResponse(),
        ),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    }
    expect(await deniedCount()).toBe(before + 4);

    await client`UPDATE user_roles SET active = false, revoked_at = now() WHERE user_id = ${global.id}`;
    await expect(
      access.authorizeGlobalAdmin(fakeRequest(global.cookie), fakeResponse()),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('requires the trusted origin and session-bound CSRF token for global-admin mutations', async () => {
    const global = await member('global@example.test', 'admin', 'global', null);
    const other = await member('other@example.test', 'admin', 'global', null);
    const before = await deniedCount();
    await expect(
      access.authorizeGlobalAdminMutation(
        fakeRequest(global.cookie, { csrf: global.csrf }),
        fakeResponse(),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      access.authorizeGlobalAdminMutation(
        fakeRequest(global.cookie, { origin: 'https://attacker.example', csrf: global.csrf }),
        fakeResponse(),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      access.authorizeGlobalAdminMutation(
        fakeRequest(global.cookie, { origin: mutationOrigin }),
        fakeResponse(),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      access.authorizeGlobalAdminMutation(
        fakeRequest(global.cookie, { origin: mutationOrigin, csrf: other.csrf }),
        fakeResponse(),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(await deniedCount()).toBe(before + 4);
  });

  it('refuses sign-in for an admin without a password with the generic failure', async () => {
    const id = await user('pending@example.test');
    await client`INSERT INTO user_roles (user_id, role) VALUES (${id}, 'admin')`;
    const pending = await request(app.getHttpServer())
      .post('/auth/admin/sign-in')
      .set('Origin', origin)
      .send({ email: 'pending@example.test', password })
      .expect(401);
    const unknown = await request(app.getHttpServer())
      .post('/auth/admin/sign-in')
      .set('Origin', origin)
      .send({ email: 'missing@example.test', password })
      .expect(401);
    expect(pending.body).toEqual(unknown.body);
    expect(pending.headers['set-cookie']).toBeUndefined();
    const sessions = await client`SELECT id FROM auth_sessions`;
    expect(sessions).toHaveLength(0);
  });
});
