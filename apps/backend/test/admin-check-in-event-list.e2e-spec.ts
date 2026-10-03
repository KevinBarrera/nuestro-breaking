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

describe('GET /admin/events (e2e)', () => {
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

  const list = () => request(app.getHttpServer()).get('/admin/events');

  async function fixture() {
    const [{ id: organizationId }] = await client<{ id: string }[]>`
      INSERT INTO organizations (name) VALUES ('Organizer') RETURNING id`;
    const [second, first] = await client<{ id: string; name: string }[]>`
      INSERT INTO events (organization_id, name, time_zone)
      VALUES (${organizationId}, 'Zeta', 'Etc/UTC'), (${organizationId}, 'Alpha', 'Etc/UTC')
      RETURNING id, name`;
    const [{ id: otherOrganization }] = await client<{ id: string }[]>`
      INSERT INTO organizations (name) VALUES ('Other organizer') RETURNING id`;
    const [third] = await client<{ id: string; name: string }[]>`
      INSERT INTO events (organization_id, name, time_zone)
      VALUES (${otherOrganization}, 'Beta', 'Etc/UTC') RETURNING id, name`;
    return { first, second, third, organizationId };
  }

  async function session(roles: { role: string; scopeType: string; scopeId?: string }[]) {
    const [{ id: userId }] = await client<{ id: string }[]>`
      INSERT INTO users (email, display_name, active)
      VALUES (${randomBytes(8).toString('hex') + '@example.com'}, 'Operator', true) RETURNING id`;
    for (const { role, scopeType, scopeId } of roles) {
      await client`
        INSERT INTO user_roles (user_id, role, scope_type, scope_id)
        VALUES (${userId}, ${role}, ${scopeType}, ${scopeId ?? null})`;
    }
    const token = randomBytes(32).toString('hex');
    await client`
      INSERT INTO auth_sessions (user_id, token_digest, expires_at)
      VALUES (${userId}, ${createHash('sha256').update(token).digest('hex')}, now() + interval '1 hour')`;
    return { cookie: `nb_admin_session=${token}`, userId };
  }

  it('requires an active session and never leaks event names on denial', async () => {
    await fixture();
    const denied = await list().expect(401);
    const { cookie, userId } = await session([{ role: 'admin', scopeType: 'global' }]);
    await client`UPDATE auth_sessions SET revoked_at = now() WHERE user_id = ${userId}`;
    expect((await list().set('Cookie', cookie).expect(401)).body).toEqual(denied.body);
    expect(JSON.stringify(denied.body)).not.toMatch(/Alpha|Beta|Zeta/);
  });

  it('returns every persisted event for global admin with only UUID and name', async () => {
    const { first, second, third } = await fixture();
    const { cookie } = await session([{ role: 'admin', scopeType: 'global' }]);
    expect((await list().set('Cookie', cookie).expect(200)).body).toEqual([first, third, second]);
  });

  it('limits event admins to assigned events, deduplicating active roles', async () => {
    const { first, second, third } = await fixture();
    const { cookie } = await session([
      { role: 'admin', scopeType: 'event', scopeId: second.id },
      { role: 'admin', scopeType: 'event', scopeId: first.id },
      { role: 'admin', scopeType: 'event', scopeId: first.id },
      { role: 'judge', scopeType: 'event', scopeId: third.id },
    ]);
    expect((await list().set('Cookie', cookie).expect(200)).body).toEqual([first, second]);
    await client`
      UPDATE user_roles SET active = false, revoked_at = now()
      WHERE role = 'admin' AND scope_id = ${second.id}`;
    expect((await list().set('Cookie', cookie).expect(200)).body).toEqual([first]);
    await client`
      UPDATE user_roles SET active = false, revoked_at = now()
      WHERE role = 'admin' AND scope_id = ${first.id}`;
    expect((await list().set('Cookie', cookie).expect(200)).body).toEqual([]);
    await request(app.getHttpServer())
      .post(`/admin/events/${third.id}/registrations/${first.id}/check-in`)
      .set('Cookie', cookie)
      .set('Origin', process.env.AUTH_TRUSTED_ORIGIN ?? 'http://localhost:5173')
      .send({})
      .expect(401);
  });

  it('returns empty for judges, organization admins and admins without eligible active roles', async () => {
    const { first, organizationId } = await fixture();
    for (const roles of [
      [{ role: 'judge', scopeType: 'global' }],
      [{ role: 'admin', scopeType: 'organization', scopeId: organizationId }],
      [{ role: 'judge', scopeType: 'event', scopeId: first.id }],
    ]) {
      const { cookie } = await session(roles);
      expect((await list().set('Cookie', cookie).expect(200)).body).toEqual([]);
    }
    const { cookie, userId } = await session([
      { role: 'admin', scopeType: 'event', scopeId: first.id },
    ]);
    await client`UPDATE user_roles SET active = false, revoked_at = now() WHERE user_id = ${userId}`;
    await list().set('Cookie', cookie).expect(401);
  });

  it('does not list events when no events are persisted', async () => {
    const { cookie } = await session([{ role: 'admin', scopeType: 'global' }]);
    expect((await list().set('Cookie', cookie).expect(200)).body).toEqual([]);
  });
});
