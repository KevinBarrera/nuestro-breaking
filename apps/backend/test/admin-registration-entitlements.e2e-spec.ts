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

type HeldPass = {
  registrationPassId: string;
  passTypeId: string;
  name: string;
  passClass: string;
  priceCents: number;
  selections: string[];
};
type Entitlements = { passes: HeldPass[]; accessibleActivityIds: string[] };
type AuditRow = {
  operation_type: string;
  actor_user_id: string;
  session_id: string;
  event_id: string;
  registration_id: string;
  participant_id: string;
  affected_activity_ids: string[];
  amount_cents: number | null;
  before_state: Record<string, unknown>;
  after_state: Record<string, unknown>;
  facts: Record<string, unknown>;
};

const sorted = (ids: string[]) => [...ids].sort();

describe('admin registration entitlements (e2e)', () => {
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

  // Catalog: two full passes with distinct selectable battles and an included workshop on the
  // first, a general pass with no activity rows, an Open Styles add-on requiring a full pass,
  // an archived pass type and a pass type of another event.
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
    const [breaking, popping, workshop, openBattle, retired, foreign] = await client<
      { id: string }[]
    >`
      INSERT INTO activities (event_id, venue_id, kind, name, starts_at, ends_at, status)
      VALUES (${event.id}, ${venue}, 'battle', 'Breaking 1v1', '2026-11-20T18:00:00Z', '2026-11-20T20:00:00Z', 'active'),
        (${event.id}, ${venue}, 'battle', 'Popping 1v1', '2026-11-20T15:00:00Z', '2026-11-20T17:00:00Z', 'active'),
        (${event.id}, ${venue}, 'workshop', 'Toprock', '2026-11-20T10:00:00Z', '2026-11-20T12:00:00Z', 'active'),
        (${event.id}, ${venue}, 'battle', 'Open Styles', '2026-11-20T21:00:00Z', '2026-11-20T22:00:00Z', 'active'),
        (${event.id}, ${venue}, 'battle', 'Retired', '2026-11-20T13:00:00Z', '2026-11-20T14:00:00Z', 'archived'),
        (${other.id}, ${venue}, 'battle', 'Foreign', '2026-11-20T10:00:00Z', '2026-11-20T12:00:00Z', 'active')
      RETURNING id`;
    const [fullBreaking, fullPopping, general, openStyles, archived] = await client<
      { id: string }[]
    >`
      INSERT INTO event_pass_types (event_id, name, pass_class, price_cents, requires_pass_class, status)
      VALUES (${event.id}, 'Full breaking', 'full', 120000, NULL, 'active'),
        (${event.id}, 'Full popping', 'full', 110000, NULL, 'active'),
        (${event.id}, 'General', 'general', 30000, NULL, 'active'),
        (${event.id}, 'Open Styles', 'add_on', 15000, 'full', 'active'),
        (${event.id}, 'Old pass', 'full', 90000, NULL, 'archived')
      RETURNING id`;
    const [{ id: foreignPass }] = await client<{ id: string }[]>`
      INSERT INTO event_pass_types (event_id, name, pass_class, price_cents)
      VALUES (${other.id}, 'Foreign pass', 'full', 1000) RETURNING id`;
    await client`INSERT INTO event_pass_type_activities (event_id, pass_type_id, activity_id, access)
      VALUES (${event.id}, ${fullBreaking.id}, ${breaking.id}, 'selectable'),
        (${event.id}, ${fullBreaking.id}, ${workshop.id}, 'included'),
        (${event.id}, ${fullBreaking.id}, ${retired.id}, 'selectable'),
        (${event.id}, ${fullPopping.id}, ${popping.id}, 'selectable'),
        (${event.id}, ${openStyles.id}, ${openBattle.id}, 'selectable'),
        (${event.id}, ${archived.id}, ${breaking.id}, 'selectable')`;
    return {
      event: event.id,
      other: other.id,
      breaking: breaking.id,
      popping: popping.id,
      workshop: workshop.id,
      openBattle: openBattle.id,
      retired: retired.id,
      foreign: foreign.id,
      fullBreaking: fullBreaking.id,
      fullPopping: fullPopping.id,
      general: general.id,
      openStyles: openStyles.id,
      archived: archived.id,
      foreignPass,
    };
  }
  async function registration(eventId: string, status = 'pending_payment') {
    const [{ id: participantId }] = await client<{ id: string }[]>`
      INSERT INTO participants (full_name, email) VALUES ('Dancer', 'dancer@example.com') RETURNING id`;
    const confirmed = status === 'confirmed';
    const [{ id }] = await client<{ id: string }[]>`
      INSERT INTO event_registrations (event_id, participant_id, status, confirmation_source, confirmed_at)
      VALUES (${eventId}, ${participantId}, ${status}, ${confirmed ? 'admin_cash' : null}, ${confirmed ? new Date().toISOString() : null})
      RETURNING id`;
    return { id, participantId };
  }
  async function holdPass(eventId: string, registrationId: string, passTypeId: string) {
    const [{ id }] = await client<{ id: string }[]>`
      INSERT INTO event_registration_passes (event_id, event_registration_id, pass_type_id, price_cents)
      VALUES (${eventId}, ${registrationId}, ${passTypeId}, 100) RETURNING id`;
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
  const base = (event: string, registrationId: string) =>
    `/admin/events/${event}/registrations/${registrationId}`;
  const read = (event: string, registrationId: string) =>
    server().get(`${base(event, registrationId)}/entitlements`);
  const addPass = (event: string, registrationId: string) =>
    server().post(`${base(event, registrationId)}/passes`);
  const select = (event: string, registrationId: string, registrationPassId: string) =>
    server().put(`${base(event, registrationId)}/passes/${registrationPassId}/selections`);
  async function audits() {
    return client<AuditRow[]>`
      SELECT operation_type, actor_user_id, session_id, event_id, registration_id, participant_id,
        affected_activity_ids, amount_cents, before_state, after_state, facts
      FROM registration_operation_audit ORDER BY created_at, id`;
  }
  async function snapshot() {
    const passes =
      await client`SELECT id, event_id, event_registration_id, pass_type_id, price_cents FROM event_registration_passes ORDER BY id`;
    const selections =
      await client`SELECT event_id, registration_pass_id, activity_id FROM event_registration_pass_selections ORDER BY registration_pass_id, activity_id`;
    return { passes, selections };
  }

  it('assigns several full passes and general entry to one registration with price snapshots and audit facts', async () => {
    const f = await fixture();
    const { cookie, userId, sessionId } = await session('admin', f.event);
    const reg = await registration(f.event);
    const first = await addPass(f.event, reg.id)
      .set(headers(cookie))
      .send({ passTypeId: f.fullBreaking })
      .expect(201);
    expect((first.body as Entitlements).passes).toHaveLength(1);
    await addPass(f.event, reg.id)
      .set(headers(cookie))
      .send({ passTypeId: f.fullPopping })
      .expect(201);
    const response = await addPass(f.event, reg.id)
      .set(headers(cookie))
      .send({ passTypeId: f.general })
      .expect(201);
    const body = response.body as Entitlements;
    expect(
      body.passes.map(({ passTypeId, name, passClass, priceCents, selections }) => ({
        passTypeId,
        name,
        passClass,
        priceCents,
        selections,
      })),
    ).toEqual([
      {
        passTypeId: f.fullBreaking,
        name: 'Full breaking',
        passClass: 'full',
        priceCents: 120000,
        selections: [],
      },
      {
        passTypeId: f.fullPopping,
        name: 'Full popping',
        passClass: 'full',
        priceCents: 110000,
        selections: [],
      },
      {
        passTypeId: f.general,
        name: 'General',
        passClass: 'general',
        priceCents: 30000,
        selections: [],
      },
    ]);
    expect(body.accessibleActivityIds).toEqual([f.workshop]);
    const stored = await client<{ id: string; pass_type_id: string; price_cents: number }[]>`
      SELECT id, pass_type_id, price_cents FROM event_registration_passes
      WHERE event_id = ${f.event} AND event_registration_id = ${reg.id}`;
    expect(stored).toHaveLength(3);
    expect(sorted(stored.map((row) => row.id))).toEqual(
      sorted(body.passes.map((pass) => pass.registrationPassId)),
    );
    const facts = await audits();
    expect(facts).toHaveLength(3);
    const generalPass = body.passes[2];
    expect(facts[2]).toEqual({
      operation_type: 'pass_assignment',
      actor_user_id: userId,
      session_id: sessionId,
      event_id: f.event,
      registration_id: reg.id,
      participant_id: reg.participantId,
      affected_activity_ids: [],
      amount_cents: null,
      before_state: { registrationPass: null },
      after_state: {
        registrationPassId: generalPass.registrationPassId,
        passTypeId: f.general,
        priceCents: 30000,
        selections: [],
      },
      facts: { registrationPassId: generalPass.registrationPassId, passTypeId: f.general },
    });
    expect(JSON.stringify(facts)).not.toMatch(/example.com|Dancer|nb_admin_session/);
  });

  it('rejects an add-on without its required pass class without writes and accepts it with one', async () => {
    const f = await fixture();
    const { cookie } = await session('admin', f.event);
    const reg = await registration(f.event);
    await holdPass(f.event, reg.id, f.general);
    const before = await snapshot();
    const rejected = await addPass(f.event, reg.id)
      .set(headers(cookie))
      .send({ passTypeId: f.openStyles })
      .expect(400);
    expect(rejected.body).toMatchObject({ message: 'Add-on requires a full pass' });
    expect(await snapshot()).toEqual(before);
    expect(await audits()).toHaveLength(0);

    // A held pass of the required class counts even if its pass type was archived later.
    await holdPass(f.event, reg.id, f.archived);
    const accepted = await addPass(f.event, reg.id)
      .set(headers(cookie))
      .send({ passTypeId: f.openStyles })
      .expect(201);
    expect((accepted.body as Entitlements).passes.map((pass) => pass.passTypeId)).toContain(
      f.openStyles,
    );
    expect(await audits()).toHaveLength(1);
  });

  it('rejects duplicate, archived, cross-event and unknown pass types and wrong registrations without writes', async () => {
    const f = await fixture();
    const { cookie } = await session('admin', f.event);
    const reg = await registration(f.event);
    const foreignReg = await registration(f.other);
    await holdPass(f.event, reg.id, f.fullBreaking);
    const before = await snapshot();
    const duplicate = await addPass(f.event, reg.id)
      .set(headers(cookie))
      .send({ passTypeId: f.fullBreaking })
      .expect(409);
    expect(duplicate.body).toMatchObject({ message: 'Registration already holds this pass type' });
    const archived = await addPass(f.event, reg.id)
      .set(headers(cookie))
      .send({ passTypeId: f.archived })
      .expect(409);
    expect(archived.body).toMatchObject({ message: 'Pass type is archived' });
    for (const passTypeId of [f.foreignPass, '00000000-0000-4000-8000-000000000000']) {
      const missing = await addPass(f.event, reg.id)
        .set(headers(cookie))
        .send({ passTypeId })
        .expect(404);
      expect(missing.body).toMatchObject({ message: 'Pass type not found' });
    }
    for (const registrationId of [foreignReg.id, '00000000-0000-4000-8000-000000000000']) {
      const missing = await addPass(f.event, registrationId)
        .set(headers(cookie))
        .send({ passTypeId: f.general })
        .expect(404);
      expect(missing.body).toMatchObject({ message: 'Registration not found' });
      await read(f.event, registrationId).set(headers(cookie)).expect(404);
    }
    for (const payload of [{}, { passTypeId: 'nope' }, { passTypeId: 7 }, []])
      await addPass(f.event, reg.id).set(headers(cookie)).send(payload).expect(400);
    expect(await snapshot()).toEqual(before);
    expect(await audits()).toHaveLength(0);
  });

  it('rejects adding passes to confirmed and voided registrations', async () => {
    const f = await fixture();
    const { cookie } = await session('admin', f.event);
    const before = await snapshot();
    for (const status of ['confirmed', 'voided']) {
      const reg = await registration(f.event, status);
      const response = await addPass(f.event, reg.id)
        .set(headers(cookie))
        .send({ passTypeId: f.general })
        .expect(409);
      expect(response.body).toMatchObject({ message: 'Registration is not pending payment' });
    }
    expect(await snapshot()).toEqual(before);
    expect(await audits()).toHaveLength(0);
  });

  it('replaces selections with selectable activities of that pass and derives accessible activities', async () => {
    const f = await fixture();
    const { cookie, userId, sessionId } = await session('admin', f.event);
    const reg = await registration(f.event);
    const full = await holdPass(f.event, reg.id, f.fullBreaking);
    await holdPass(f.event, reg.id, f.general);
    const response = await select(f.event, reg.id, full)
      .set(headers(cookie))
      .send({ activityIds: [f.breaking] })
      .expect(200);
    const body = response.body as Entitlements;
    expect(body.passes.find((pass) => pass.registrationPassId === full)?.selections).toEqual([
      f.breaking,
    ]);
    expect(body.accessibleActivityIds).toEqual(sorted([f.breaking, f.workshop]));
    expect(
      await client`SELECT activity_id FROM event_registration_pass_selections WHERE registration_pass_id = ${full}`,
    ).toEqual([{ activity_id: f.breaking }]);
    expect(await audits()).toEqual([
      {
        operation_type: 'pass_selection_change',
        actor_user_id: userId,
        session_id: sessionId,
        event_id: f.event,
        registration_id: reg.id,
        participant_id: reg.participantId,
        affected_activity_ids: [f.breaking],
        amount_cents: null,
        before_state: { registrationPassId: full, selections: [] },
        after_state: { registrationPassId: full, selections: [f.breaking] },
        facts: { registrationPassId: full, passTypeId: f.fullBreaking },
      },
    ]);

    const cleared = await select(f.event, reg.id, full)
      .set(headers(cookie))
      .send({ activityIds: [] })
      .expect(200);
    expect((cleared.body as Entitlements).accessibleActivityIds).toEqual([f.workshop]);
    const facts = await audits();
    expect(facts).toHaveLength(2);
    expect(facts[1]).toMatchObject({
      affected_activity_ids: [f.breaking],
      before_state: { registrationPassId: full, selections: [f.breaking] },
      after_state: { registrationPassId: full, selections: [] },
    });
  });

  it('rejects selections outside the selectable activities of that pass without writes', async () => {
    const f = await fixture();
    const { cookie } = await session('admin', f.event);
    const reg = await registration(f.event);
    const otherReg = await registration(f.event);
    const full = await holdPass(f.event, reg.id, f.fullBreaking);
    const otherPass = await holdPass(f.event, otherReg.id, f.fullPopping);
    await client`INSERT INTO event_registration_pass_selections (event_id, registration_pass_id, activity_id)
      VALUES (${f.event}, ${full}, ${f.breaking})`;
    const before = await snapshot();
    for (const activityIds of [
      [f.workshop],
      [f.popping],
      [f.retired],
      [f.foreign],
      [f.breaking, f.breaking],
      [f.breaking, f.breaking.toUpperCase()],
      ['00000000-0000-4000-8000-000000000000'],
    ]) {
      await select(f.event, reg.id, full).set(headers(cookie)).send({ activityIds }).expect(400);
    }
    for (const payload of [{}, { activityIds: 'x' }, { activityIds: ['nope'] }, []])
      await select(f.event, reg.id, full).set(headers(cookie)).send(payload).expect(400);
    for (const registrationPassId of [otherPass, '00000000-0000-4000-8000-000000000000']) {
      const missing = await select(f.event, reg.id, registrationPassId)
        .set(headers(cookie))
        .send({ activityIds: [] })
        .expect(404);
      expect(missing.body).toMatchObject({ message: 'Registration pass not found' });
    }
    expect(await snapshot()).toEqual(before);
    expect(await audits()).toHaveLength(0);
  });

  it('allows selection changes on confirmed registrations and rejects them on voided ones', async () => {
    const f = await fixture();
    const { cookie } = await session('admin', f.event);
    const confirmed = await registration(f.event, 'confirmed');
    const confirmedPass = await holdPass(f.event, confirmed.id, f.fullPopping);
    await select(f.event, confirmed.id, confirmedPass)
      .set(headers(cookie))
      .send({ activityIds: [f.popping] })
      .expect(200);
    const voided = await registration(f.event, 'voided');
    const voidedPass = await holdPass(f.event, voided.id, f.fullPopping);
    const before = await snapshot();
    const response = await select(f.event, voided.id, voidedPass)
      .set(headers(cookie))
      .send({ activityIds: [f.popping] })
      .expect(409);
    expect(response.body).toMatchObject({ message: 'Registration is voided' });
    expect(await snapshot()).toEqual(before);
    expect(await audits()).toHaveLength(1);
  });

  it('reads entitlements: general-only grants nothing, full grants included plus selected, prices stay snapshotted', async () => {
    const f = await fixture();
    const { cookie } = await session('admin', f.event);
    const judge = await session('judge', f.event);
    const generalOnly = await registration(f.event);
    const generalPass = await holdPass(f.event, generalOnly.id, f.general);
    const general = await read(f.event, generalOnly.id).set(headers(cookie)).expect(200);
    expect(general.body).toEqual({
      passes: [
        {
          registrationPassId: generalPass,
          passTypeId: f.general,
          name: 'General',
          passClass: 'general',
          priceCents: 100,
          selections: [],
        },
      ],
      accessibleActivityIds: [],
    });

    const reg = await registration(f.event);
    const added = await addPass(f.event, reg.id)
      .set(headers(cookie))
      .send({ passTypeId: f.fullBreaking })
      .expect(201);
    const full = (added.body as Entitlements).passes[0].registrationPassId;
    await select(f.event, reg.id, full)
      .set(headers(cookie))
      .send({ activityIds: [f.breaking] })
      .expect(200);
    await client`UPDATE event_pass_types SET price_cents = 999999 WHERE id = ${f.fullBreaking}`;
    const response = await read(f.event, reg.id).set(headers(cookie)).expect(200);
    const body = response.body as Entitlements;
    expect(body.passes).toEqual([
      {
        registrationPassId: full,
        passTypeId: f.fullBreaking,
        name: 'Full breaking',
        passClass: 'full',
        priceCents: 120000,
        selections: [f.breaking],
      },
    ]);
    expect(body.accessibleActivityIds).toEqual(sorted([f.breaking, f.workshop]));

    // Archived activities never grant access, whether included or selected.
    await client`UPDATE activities SET status = 'archived' WHERE id = ${f.workshop}`;
    const afterArchive = await read(f.event, reg.id).set(headers(cookie)).expect(200);
    expect((afterArchive.body as Entitlements).accessibleActivityIds).toEqual([f.breaking]);

    await read(f.event, reg.id).set('Cookie', judge.cookie).expect(401);
    await read(f.event, reg.id).expect(401);
  });

  it('rejects writes from judges, unauthenticated callers, other-event admins and missing CSRF or origin', async () => {
    const f = await fixture();
    const admin = await session('admin', f.event);
    const judge = await session('judge', f.event);
    const otherAdmin = await session('admin', f.other);
    const reg = await registration(f.event);
    const full = await holdPass(f.event, reg.id, f.fullBreaking);
    const before = await snapshot();
    const commands = [
      () => addPass(f.event, reg.id).send({ passTypeId: f.general }),
      () => select(f.event, reg.id, full).send({ activityIds: [f.breaking] }),
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

  it('rolls back the entitlement change when the audit fact cannot be written', async () => {
    const f = await fixture();
    const { cookie } = await session('admin', f.event);
    const reg = await registration(f.event);
    const full = await holdPass(f.event, reg.id, f.fullBreaking);
    const before = await snapshot();
    await client`ALTER TABLE registration_operation_audit ADD CONSTRAINT reject_entitlement_test
      CHECK (operation_type NOT IN ('pass_assignment', 'pass_selection_change')) NOT VALID`;
    try {
      await addPass(f.event, reg.id)
        .set(headers(cookie))
        .send({ passTypeId: f.general })
        .expect(500);
      await select(f.event, reg.id, full)
        .set(headers(cookie))
        .send({ activityIds: [f.breaking] })
        .expect(500);
    } finally {
      await client`ALTER TABLE registration_operation_audit DROP CONSTRAINT reject_entitlement_test`;
    }
    expect(await snapshot()).toEqual(before);
    expect(await audits()).toHaveLength(0);
  });
});
