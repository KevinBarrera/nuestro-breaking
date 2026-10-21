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
import { readTrustedOrigin } from '@/http';
import { PostgresHarness } from './support/postgres-harness';

jest.setTimeout(120_000);

type Entitlements = {
  registration: { id: string; status: string };
  passes: {
    registrationPassId: string;
    passTypeId: string;
    name: string;
    passClass: string;
    priceCents: number;
    selections: string[];
  }[];
  accessibleActivityIds: string[];
};

const sorted = (ids: string[]) => [...ids].sort();

// Discipline swap (#104): an admin moves the single full pass of a registration to another full
// pass of the same current price, replacing its competitions, with a mandatory reason.
describe('admin registration discipline swap (e2e)', () => {
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

  // Catalog: Breaking and Popping full passes at the same price (Breaking with an included
  // workshop), a pricier Locking full pass, a general pass, an Open Styles add-on, an archived full
  // pass at the same price and a same-price full pass of another event.
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
    const [breaking, popping, popping2v2, workshop, openBattle, retired, locking] = await client<
      { id: string }[]
    >`
      INSERT INTO activities (event_id, venue_id, kind, name, starts_at, ends_at, status)
      VALUES (${event.id}, ${venue}, 'competition', 'Breaking 1v1', '2026-11-20T18:00:00Z', '2026-11-20T20:00:00Z', 'active'),
        (${event.id}, ${venue}, 'competition', 'Popping 1v1', '2026-11-20T15:00:00Z', '2026-11-20T17:00:00Z', 'active'),
        (${event.id}, ${venue}, 'competition', 'Popping 2v2', '2026-11-21T15:00:00Z', '2026-11-21T17:00:00Z', 'active'),
        (${event.id}, ${venue}, 'workshop', 'Toprock', '2026-11-20T10:00:00Z', '2026-11-20T12:00:00Z', 'active'),
        (${event.id}, ${venue}, 'competition', 'Open Styles', '2026-11-20T21:00:00Z', '2026-11-20T22:00:00Z', 'active'),
        (${event.id}, ${venue}, 'competition', 'Retired', '2026-11-20T13:00:00Z', '2026-11-20T14:00:00Z', 'archived'),
        (${event.id}, ${venue}, 'competition', 'Locking 1v1', '2026-11-21T18:00:00Z', '2026-11-21T20:00:00Z', 'active')
      RETURNING id`;
    const [fullBreaking, fullPopping, fullLocking, general, openStyles, archived] = await client<
      { id: string }[]
    >`
      INSERT INTO event_pass_types (event_id, name, pass_class, price_cents, requires_pass_class, status)
      VALUES (${event.id}, 'Full breaking', 'full', 120000, NULL, 'active'),
        (${event.id}, 'Full popping', 'full', 120000, NULL, 'active'),
        (${event.id}, 'Full locking', 'full', 130000, NULL, 'active'),
        (${event.id}, 'General', 'general', 120000, NULL, 'active'),
        (${event.id}, 'Open Styles', 'add_on', 15000, 'full', 'active'),
        (${event.id}, 'Old pass', 'full', 120000, NULL, 'archived')
      RETURNING id`;
    const [{ id: foreignPass }] = await client<{ id: string }[]>`
      INSERT INTO event_pass_types (event_id, name, pass_class, price_cents)
      VALUES (${other.id}, 'Foreign pass', 'full', 120000) RETURNING id`;
    await client`INSERT INTO event_pass_type_activities (event_id, pass_type_id, activity_id, access)
      VALUES (${event.id}, ${fullBreaking.id}, ${breaking.id}, 'selectable'),
        (${event.id}, ${fullBreaking.id}, ${workshop.id}, 'included'),
        (${event.id}, ${fullPopping.id}, ${popping.id}, 'selectable'),
        (${event.id}, ${fullPopping.id}, ${popping2v2.id}, 'selectable'),
        (${event.id}, ${fullPopping.id}, ${retired.id}, 'selectable'),
        (${event.id}, ${fullPopping.id}, ${workshop.id}, 'included'),
        (${event.id}, ${fullLocking.id}, ${locking.id}, 'selectable'),
        (${event.id}, ${openStyles.id}, ${openBattle.id}, 'selectable')`;
    return {
      event: event.id,
      other: other.id,
      venue,
      breaking: breaking.id,
      popping: popping.id,
      popping2v2: popping2v2.id,
      workshop: workshop.id,
      openBattle: openBattle.id,
      retired: retired.id,
      locking: locking.id,
      fullBreaking: fullBreaking.id,
      fullPopping: fullPopping.id,
      fullLocking: fullLocking.id,
      general: general.id,
      openStyles: openStyles.id,
      archived: archived.id,
      foreignPass,
    };
  }
  async function registration(
    eventId: string,
    options: { status?: string; online?: boolean } = {},
  ) {
    const status = options.status ?? 'pending_payment';
    const [{ id: participantId }] = await client<{ id: string }[]>`
      INSERT INTO participants (full_name, email) VALUES ('Dancer', 'dancer@example.com') RETURNING id`;
    const confirmed = status === 'confirmed';
    const expiresAt = options.online ? new Date(Date.now() + 3_600_000).toISOString() : null;
    const [{ id }] = await client<{ id: string }[]>`
      INSERT INTO event_registrations (event_id, participant_id, status, confirmation_source, confirmed_at, expires_at)
      VALUES (${eventId}, ${participantId}, ${status}, ${confirmed ? 'admin_cash' : null}, ${confirmed ? new Date().toISOString() : null}, ${expiresAt})
      RETURNING id`;
    return { id, participantId };
  }
  // Holds a pass with a 100-cent snapshot, deliberately unlike the catalog price.
  async function holdPass(
    eventId: string,
    registrationId: string,
    passTypeId: string,
    selections: string[] = [],
  ) {
    const [{ id }] = await client<{ id: string }[]>`
      INSERT INTO event_registration_passes (event_id, event_registration_id, pass_type_id, price_cents)
      VALUES (${eventId}, ${registrationId}, ${passTypeId}, 100) RETURNING id`;
    for (const activityId of selections)
      await client`INSERT INTO event_registration_pass_selections (event_id, registration_pass_id, activity_id)
        VALUES (${eventId}, ${id}, ${activityId})`;
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
  async function checkIn(eventId: string, registrationId: string) {
    const { userId, sessionId } = await session('admin', eventId);
    await client`INSERT INTO event_check_ins (event_id, event_registration_id, actor_user_id, session_id)
      VALUES (${eventId}, ${registrationId}, ${userId}, ${sessionId})`;
  }
  const trustedOrigin = readTrustedOrigin(process.env);
  const headers = (cookie: string) => ({
    Cookie: cookie,
    Origin: trustedOrigin,
    'X-CSRF-Token': createHash('sha256')
      .update(`nb-admin-csrf-v1:${cookie.slice('nb_admin_session='.length)}`)
      .digest('hex'),
  });
  const server = () => request(app.getHttpServer());
  const swap = (event: string, registrationId: string) =>
    server().post(`/admin/events/${event}/registrations/${registrationId}/discipline-swap`);
  async function audits() {
    return client`SELECT operation_type, actor_kind, actor_user_id, session_id, event_id,
        registration_id, participant_id, affected_activity_ids, amount_cents, note,
        before_state, after_state, facts
      FROM registration_operation_audit ORDER BY created_at, id`;
  }
  async function snapshot() {
    const passes =
      await client`SELECT id, event_id, event_registration_id, pass_type_id, price_cents FROM event_registration_passes ORDER BY id`;
    const selections =
      await client`SELECT event_id, registration_pass_id, activity_id FROM event_registration_pass_selections ORDER BY registration_pass_id, activity_id`;
    const registrations =
      await client`SELECT id, status, confirmation_source, confirmed_at, expires_at, updated_at FROM event_registrations ORDER BY id`;
    return { passes, selections, registrations };
  }

  it('swaps the full pass of a pending registration, replacing its competitions and keeping the price snapshot (#104)', async () => {
    const f = await fixture();
    const { cookie, userId, sessionId } = await session('admin', f.event);
    const reg = await registration(f.event);
    const full = await holdPass(f.event, reg.id, f.fullBreaking, [f.breaking]);
    const response = await swap(f.event, reg.id)
      .set(headers(cookie))
      .send({
        toPassTypeId: f.fullPopping.toUpperCase(),
        activityIds: [f.popping],
        reason: '  Wrong discipline at the door  ',
      })
      .expect(200);
    const body = response.body as Entitlements;
    expect(body.registration).toMatchObject({ id: reg.id, status: 'pending_payment' });
    expect(body.passes).toEqual([
      {
        registrationPassId: full,
        passTypeId: f.fullPopping,
        name: 'Full popping',
        passClass: 'full',
        priceCents: 100,
        selections: [f.popping],
      },
    ]);
    expect(body.accessibleActivityIds).toEqual(sorted([f.popping, f.workshop]));
    const { passes, selections } = await snapshot();
    expect(passes).toEqual([
      {
        id: full,
        event_id: f.event,
        event_registration_id: reg.id,
        pass_type_id: f.fullPopping,
        price_cents: 100,
      },
    ]);
    expect(selections).toEqual([
      { event_id: f.event, registration_pass_id: full, activity_id: f.popping },
    ]);
    expect(await audits()).toEqual([
      {
        operation_type: 'registration_discipline_swap',
        actor_kind: 'admin',
        actor_user_id: userId,
        session_id: sessionId,
        event_id: f.event,
        registration_id: reg.id,
        participant_id: reg.participantId,
        affected_activity_ids: sorted([f.breaking, f.popping]),
        amount_cents: null,
        note: 'Wrong discipline at the door',
        before_state: { status: 'pending_payment', passTypeId: f.fullBreaking },
        after_state: { status: 'pending_payment', passTypeId: f.fullPopping },
        facts: {
          fromPassTypeId: f.fullBreaking,
          toPassTypeId: f.fullPopping,
          fromActivityIds: [f.breaking],
          toActivityIds: [f.popping],
        },
      },
    ]);
  });

  it('swaps the full pass of a confirmed online registration, leaving its add-on and status untouched (#104)', async () => {
    const f = await fixture();
    const { cookie } = await session('admin', f.event);
    const reg = await registration(f.event, { status: 'confirmed', online: true });
    const full = await holdPass(f.event, reg.id, f.fullBreaking, [f.breaking]);
    const addOn = await holdPass(f.event, reg.id, f.openStyles, [f.openBattle]);
    const before = await snapshot();
    const response = await swap(f.event, reg.id)
      .set(headers(cookie))
      .send({
        toPassTypeId: f.fullPopping,
        activityIds: [f.popping2v2, f.popping],
        reason: 'Signed up for popping',
      })
      .expect(200);
    const body = response.body as Entitlements;
    expect(body.registration).toMatchObject({ status: 'confirmed', channel: 'online' });
    expect(body.passes.map((pass) => [pass.registrationPassId, pass.passTypeId])).toEqual(
      expect.arrayContaining([
        [full, f.fullPopping],
        [addOn, f.openStyles],
      ]),
    );
    expect(body.passes.find((pass) => pass.registrationPassId === full)?.selections).toEqual(
      sorted([f.popping, f.popping2v2]),
    );
    expect(body.accessibleActivityIds).toEqual(
      sorted([f.popping, f.popping2v2, f.workshop, f.openBattle]),
    );
    const after = await snapshot();
    // Registration status, confirmation and expiry stay; only the held full pass changes type.
    expect(after.registrations).toEqual(before.registrations);
    expect(after.passes).toEqual(
      before.passes.map((pass) =>
        pass.id === full ? { ...pass, pass_type_id: f.fullPopping } : pass,
      ),
    );
    expect(after.selections).toEqual(
      expect.arrayContaining([
        { event_id: f.event, registration_pass_id: addOn, activity_id: f.openBattle },
        { event_id: f.event, registration_pass_id: full, activity_id: f.popping },
        { event_id: f.event, registration_pass_id: full, activity_id: f.popping2v2 },
      ]),
    );
    expect(after.selections).toHaveLength(3);
    const [fact] = await audits();
    expect(fact).toMatchObject({
      operation_type: 'registration_discipline_swap',
      amount_cents: null,
      note: 'Signed up for popping',
      affected_activity_ids: sorted([f.breaking, f.popping, f.popping2v2]),
      before_state: { status: 'confirmed', passTypeId: f.fullBreaking },
      after_state: { status: 'confirmed', passTypeId: f.fullPopping },
      facts: {
        fromPassTypeId: f.fullBreaking,
        toPassTypeId: f.fullPopping,
        fromActivityIds: [f.breaking],
        toActivityIds: sorted([f.popping, f.popping2v2]),
      },
    });
  });

  it('swaps to a pass without competitions when none are chosen (#104)', async () => {
    const f = await fixture();
    const { cookie } = await session('admin', f.event);
    const reg = await registration(f.event);
    await holdPass(f.event, reg.id, f.fullBreaking, [f.breaking]);
    const response = await swap(f.event, reg.id)
      .set(headers(cookie))
      .send({ toPassTypeId: f.fullPopping, activityIds: [], reason: 'No battles' })
      .expect(200);
    expect((response.body as Entitlements).passes[0].selections).toEqual([]);
    expect((await snapshot()).selections).toEqual([]);
    expect((await audits())[0]).toMatchObject({
      affected_activity_ids: [f.breaking],
      facts: { fromActivityIds: [f.breaking], toActivityIds: [] },
    });
  });

  it('rejects a malformed body with field errors before looking up the registration (#104)', async () => {
    const f = await fixture();
    const { cookie } = await session('admin', f.event);
    const reg = await registration(f.event);
    await holdPass(f.event, reg.id, f.fullBreaking, [f.breaking]);
    const foreign = await registration(f.other);
    const otherAdmin = await session('admin', f.other);
    const before = await snapshot();
    const valid = { toPassTypeId: f.fullPopping, activityIds: [f.popping], reason: 'Swap' };
    const cases: [Record<string, unknown>, Record<string, string>][] = [
      [{ activityIds: [], reason: 'Swap' }, { toPassTypeId: 'required' }],
      [{ ...valid, toPassTypeId: 'nope' }, { toPassTypeId: 'invalid' }],
      [{ ...valid, toPassTypeId: 7 }, { toPassTypeId: 'invalid' }],
      [{ toPassTypeId: f.fullPopping, reason: 'Swap' }, { activityIds: 'required' }],
      [{ ...valid, activityIds: f.popping }, { activityIds: 'invalid' }],
      [{ ...valid, activityIds: [f.popping, 'nope'] }, { 'activityIds[1]': 'invalid' }],
      [
        { ...valid, activityIds: [f.popping, f.popping.toUpperCase()] },
        { 'activityIds[1]': 'duplicate' },
      ],
      [{ ...valid, passTypeId: f.fullPopping }, { passTypeId: 'unknown_field' }],
    ];
    for (const [body, fieldErrors] of cases) {
      const response = await swap(f.event, reg.id).set(headers(cookie)).send(body).expect(400);
      expect(response.body).toMatchObject({ message: 'Invalid discipline swap', fieldErrors });
    }
    // Field errors come first even for a registration of another event.
    await swap(f.other, reg.id)
      .set(headers(otherAdmin.cookie))
      .send({ ...valid, toPassTypeId: 'nope' })
      .expect(400);
    await swap(f.event, foreign.id)
      .set(headers(cookie))
      .send({ ...valid, toPassTypeId: 'nope' })
      .expect(400);
    await swap(f.event, 'nope').set(headers(cookie)).send(valid).expect(400);
    expect(await snapshot()).toEqual(before);
    expect(await audits()).toHaveLength(0);
  });

  it('rejects unknown or other-event registrations with 404, then a missing reason (#104)', async () => {
    const f = await fixture();
    const { cookie } = await session('admin', f.event);
    const reg = await registration(f.event);
    await holdPass(f.event, reg.id, f.fullBreaking, [f.breaking]);
    const foreign = await registration(f.other);
    const before = await snapshot();
    const valid = { toPassTypeId: f.fullPopping, activityIds: [f.popping], reason: 'Swap' };
    await swap(f.event, foreign.id).set(headers(cookie)).send(valid).expect(404);
    await swap(f.event, foreign.id)
      .set(headers(cookie))
      .send({ ...valid, reason: '' })
      .expect(404);
    await swap(f.event, '00000000-0000-4000-8000-000000000000')
      .set(headers(cookie))
      .send(valid)
      .expect(404);
    for (const reason of [undefined, null, '', '   ', 7, 'x'.repeat(501)]) {
      const response = await swap(f.event, reg.id)
        .set(headers(cookie))
        .send({ ...valid, reason })
        .expect(400);
      expect(response.body).toMatchObject({ code: 'correction_reason_required' });
    }
    expect(await snapshot()).toEqual(before);
    expect(await audits()).toHaveLength(0);
  });

  it('rejects voided, multi-full, pass-less and checked-in registrations without writes (#104)', async () => {
    const f = await fixture();
    const { cookie } = await session('admin', f.event);
    const valid = { toPassTypeId: f.fullPopping, activityIds: [f.popping], reason: 'Swap' };
    const voided = await registration(f.event, { status: 'voided' });
    await holdPass(f.event, voided.id, f.fullBreaking);
    const twoFull = await registration(f.event);
    await holdPass(f.event, twoFull.id, f.fullBreaking);
    await holdPass(f.event, twoFull.id, f.fullLocking);
    const generalOnly = await registration(f.event);
    await holdPass(f.event, generalOnly.id, f.general);
    const empty = await registration(f.event);
    const checkedIn = await registration(f.event, { status: 'confirmed' });
    await holdPass(f.event, checkedIn.id, f.fullBreaking, [f.breaking]);
    await checkIn(f.event, checkedIn.id);
    const before = await snapshot();
    const expectations: [string, number, string][] = [
      [voided.id, 409, 'registration_voided'],
      [twoFull.id, 409, 'discipline_swap_single_full_pass_required'],
      [generalOnly.id, 409, 'discipline_swap_single_full_pass_required'],
      [empty.id, 409, 'discipline_swap_single_full_pass_required'],
      [checkedIn.id, 409, 'discipline_swap_checked_in'],
    ];
    for (const [id, status, code] of expectations) {
      const response = await swap(f.event, id).set(headers(cookie)).send(valid).expect(status);
      expect(response.body).toMatchObject({ code });
    }
    expect(await snapshot()).toEqual(before);
    expect(await audits()).toHaveLength(0);
  });

  it('rejects invalid targets, a price difference and non-selectable competitions without writes (#104)', async () => {
    const f = await fixture();
    const { cookie } = await session('admin', f.event);
    const reg = await registration(f.event);
    await holdPass(f.event, reg.id, f.fullBreaking, [f.breaking]);
    const before = await snapshot();
    const send = (toPassTypeId: string, activityIds: string[] = []) =>
      swap(f.event, reg.id)
        .set(headers(cookie))
        .send({ toPassTypeId, activityIds, reason: 'Swap' });
    for (const target of [
      f.fullBreaking,
      f.general,
      f.openStyles,
      f.archived,
      f.foreignPass,
      '00000000-0000-4000-8000-000000000000',
    ]) {
      const response = await send(target).expect(400);
      expect(response.body).toMatchObject({ code: 'discipline_swap_invalid_target' });
    }
    const mismatch = await send(f.fullLocking, [f.locking]).expect(409);
    expect(mismatch.body).toMatchObject({ code: 'discipline_swap_price_mismatch' });
    // Competitions must be active and selectable on the target pass type.
    for (const activityIds of [
      [f.breaking],
      [f.workshop],
      [f.retired],
      [f.popping, f.openBattle],
    ]) {
      const response = await send(f.fullPopping, activityIds).expect(400);
      expect(response.body).toMatchObject({ message: 'Invalid activity selection' });
    }
    expect(await snapshot()).toEqual(before);
    expect(await audits()).toHaveLength(0);
  });

  it('compares current catalog prices, not the stored snapshot (#104)', async () => {
    const f = await fixture();
    const { cookie } = await session('admin', f.event);
    const reg = await registration(f.event);
    await holdPass(f.event, reg.id, f.fullBreaking, [f.breaking]);
    await client`UPDATE event_pass_types SET price_cents = 130000 WHERE id = ${f.fullBreaking}`;
    const response = await swap(f.event, reg.id)
      .set(headers(cookie))
      .send({ toPassTypeId: f.fullLocking, activityIds: [f.locking], reason: 'Locking now' })
      .expect(200);
    expect((response.body as Entitlements).passes[0]).toMatchObject({
      passTypeId: f.fullLocking,
      priceCents: 100,
    });
  });

  it('rejects swaps from judges, unauthenticated callers, other-event admins and missing CSRF or origin (#104)', async () => {
    const f = await fixture();
    const admin = await session('admin', f.event);
    const judge = await session('judge', f.event);
    const otherAdmin = await session('admin', f.other);
    const reg = await registration(f.event);
    await holdPass(f.event, reg.id, f.fullBreaking, [f.breaking]);
    const before = await snapshot();
    const command = () =>
      swap(f.event, reg.id).send({
        toPassTypeId: f.fullPopping,
        activityIds: [f.popping],
        reason: 'Swap',
      });
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
    expect(await audits()).toHaveLength(0);
  });

  it('rolls back the swap when the audit fact cannot be written (#104)', async () => {
    const f = await fixture();
    const { cookie } = await session('admin', f.event);
    const reg = await registration(f.event);
    await holdPass(f.event, reg.id, f.fullBreaking, [f.breaking]);
    const before = await snapshot();
    await client`ALTER TABLE registration_operation_audit ADD CONSTRAINT reject_swap_test
      CHECK (operation_type <> 'registration_discipline_swap') NOT VALID`;
    try {
      await swap(f.event, reg.id)
        .set(headers(cookie))
        .send({ toPassTypeId: f.fullPopping, activityIds: [f.popping], reason: 'Swap' })
        .expect(500);
    } finally {
      await client`ALTER TABLE registration_operation_audit DROP CONSTRAINT reject_swap_test`;
    }
    expect(await snapshot()).toEqual(before);
    expect(await audits()).toHaveLength(0);
  });
});
