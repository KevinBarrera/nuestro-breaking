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
const trustedOrigin = readTrustedOrigin(process.env);
const password = 'SufficientlyStrong1!';

type Session = { id: string; cookie: string; csrf: string };
type Member = {
  id: string;
  email: string;
  status: string;
  access: unknown;
  invitation: unknown;
};

// Team members whose only access disappeared stay in the team as "no access" (#213 T12, D9).
describe('admin team members without access (e2e)', () => {
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

  async function sessionOf(email: string): Promise<Session> {
    const signed = await signIn(email).expect(201);
    const cookie = (signed.headers['set-cookie'] as unknown as string[])[0].split(';')[0];
    const [{ id }] = await client<{ id: string }[]>`SELECT id FROM users WHERE email = ${email}`;
    return { id, cookie, csrf: (signed.body as { csrfToken: string }).csrfToken };
  }

  async function globalAdmin(): Promise<Session> {
    const email = 'root@example.test';
    const [{ id }] = await client<{ id: string }[]>`
      INSERT INTO users (email, display_name, password_hash)
      VALUES (${email}, 'Root', ${await hashPassword(password)}) RETURNING id`;
    await client`INSERT INTO user_roles (user_id, role, scope_type) VALUES (${id}, 'admin', 'global')`;
    return sessionOf(email);
  }

  async function event(name: string, slug: string) {
    const [{ id: org }] = await client<{ id: string }[]>`
      INSERT INTO organizations (name) VALUES (${name}) RETURNING id`;
    const [{ id }] = await client<{ id: string }[]>`
      INSERT INTO events (organization_id, name, time_zone, slug)
      VALUES (${org}, ${name}, 'Etc/UTC', ${slug}) RETURNING id`;
    return id;
  }

  const mutate = (
    method: 'post' | 'put' | 'delete',
    path: string,
    session: Session,
    body: object = {},
  ) =>
    http()
      [method](path)
      .set('Origin', trustedOrigin)
      .set('Cookie', session.cookie)
      .set('X-CSRF-Token', session.csrf)
      .send(body);

  const invite = (admin: Session, email: string, eventIds: string[]) =>
    mutate('post', '/admin/team', admin, {
      displayName: 'Scoped',
      email,
      access: { kind: 'events', eventIds },
    });

  async function team(admin: Session): Promise<Member[]> {
    const response = await http().get('/admin/team').set('Cookie', admin.cookie).expect(200);
    return (response.body as { members: Member[] }).members;
  }

  /** Invites an admin scoped to `eventId` and activates the link, as the invitee would. */
  async function scopedAdmin(admin: Session, email: string, eventId: string) {
    const invited = await invite(admin, email, [eventId]).expect(201);
    const { userId, activationUrl } = invited.body as { userId: string; activationUrl: string };
    await http()
      .post('/auth/activation')
      .set('Origin', trustedOrigin)
      .send({ token: activationUrl.split('#')[1], password })
      .expect(200);
    return userId;
  }

  const deleteEvent = (admin: Session, eventId: string, slug: string) =>
    mutate('delete', `/admin/events/${eventId}`, admin, { confirmSlug: slug }).expect(204);

  it('keeps a member whose only event was deleted, and restores them with a new scope', async () => {
    const admin = await globalAdmin();
    const first = await event('Primero', 'primero');
    const userId = await scopedAdmin(admin, 'scoped@example.test', first);
    await deleteEvent(admin, first, 'primero');

    expect((await team(admin)).find((member) => member.id === userId)).toEqual({
      id: userId,
      displayName: 'Scoped',
      email: 'scoped@example.test',
      status: 'no_access',
      access: { kind: 'none' },
      invitation: null,
    });
    // Without any role they cannot sign in, and their email still cannot be invited again.
    await signIn('scoped@example.test').expect(401);
    const again = await invite(admin, 'scoped@example.test', [await event('Otro', 'otro')]);
    expect(again.status).toBe(409);
    expect(again.body).toMatchObject({ code: 'email_in_use' });

    const second = await event('Segundo', 'segundo');
    const changed = await mutate('put', `/admin/team/${userId}/access`, admin, {
      access: { kind: 'events', eventIds: [second] },
      reason: 'New event',
    }).expect(200);
    expect(changed.body).toEqual({ changed: true });
    const [audit] = await client<{ reason: string; details: unknown }[]>`
      SELECT reason, details FROM admin_team_audit
      WHERE target_user_id = ${userId} AND action = 'scope_changed'`;
    expect(audit).toEqual({
      reason: 'New event',
      details: { from: { kind: 'none' }, to: { kind: 'events', eventIds: [second] } },
    });

    const restored = (await team(admin)).find((member) => member.id === userId);
    expect(restored).toMatchObject({
      status: 'active',
      access: { kind: 'events', events: [{ id: second, name: 'Segundo' }] },
    });
    const scoped = await sessionOf('scoped@example.test');
    await http().get(`/admin/events/${second}/pass-types`).set('Cookie', scoped.cookie).expect(200);
  });

  it('keeps a pending member with their open link, and refuses a new link until access returns', async () => {
    const admin = await globalAdmin();
    const first = await event('Primero', 'primero');
    const invited = await invite(admin, 'pending@example.test', [first]).expect(201);
    const { userId } = invited.body as { userId: string };
    await deleteEvent(admin, first, 'primero');

    const member = (await team(admin)).find((row) => row.id === userId);
    expect(member).toMatchObject({ status: 'no_access', access: { kind: 'none' } });
    expect(member?.invitation).toMatchObject({ expired: false });

    const regenerated = await mutate('post', `/admin/team/${userId}/invitation`, admin);
    expect(regenerated.status).toBe(409);
    expect(regenerated.body).toMatchObject({ code: 'member_no_access' });
    await mutate('delete', `/admin/team/${userId}/invitation`, admin).expect(200);

    await mutate('put', `/admin/team/${userId}/access`, admin, {
      access: { kind: 'global' },
    }).expect(200);
    expect((await team(admin)).find((row) => row.id === userId)).toMatchObject({
      status: 'pending',
      access: { kind: 'global' },
    });
  });

  it('deactivates and reactivates a member without access', async () => {
    const admin = await globalAdmin();
    const first = await event('Primero', 'primero');
    const userId = await scopedAdmin(admin, 'scoped@example.test', first);
    await deleteEvent(admin, first, 'primero');

    const off = await mutate('post', `/admin/team/${userId}/deactivate`, admin, {
      reason: 'Left',
    }).expect(200);
    expect(off.body).toEqual({ status: 'deactivated' });
    expect((await team(admin)).find((row) => row.id === userId)).toMatchObject({
      status: 'deactivated',
      access: { kind: 'none' },
    });

    const on = await mutate('post', `/admin/team/${userId}/reactivate`, admin).expect(200);
    expect(on.body).toEqual({ status: 'no_access' });
    expect((await team(admin)).find((row) => row.id === userId)).toMatchObject({
      status: 'no_access',
    });
  });

  it('still leaves judges and users who were never admins out of the team', async () => {
    const admin = await globalAdmin();
    const [{ id: judge }] = await client<{ id: string }[]>`
      INSERT INTO users (email, display_name) VALUES ('judge@example.test', 'Judge') RETURNING id`;
    await client`INSERT INTO user_roles (user_id, role, scope_type) VALUES (${judge}, 'judge', 'global')`;
    await client`INSERT INTO users (email, display_name) VALUES ('nobody@example.test', 'Nobody')`;

    expect((await team(admin)).map((member) => member.email)).toEqual(['root@example.test']);
    await mutate('put', `/admin/team/${judge}/access`, admin, {
      access: { kind: 'global' },
    }).expect(404);
  });
});
