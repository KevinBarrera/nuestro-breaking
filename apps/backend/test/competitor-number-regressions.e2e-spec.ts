import { createHash, randomBytes, randomUUID } from 'node:crypto';
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

type CheckInBody = { alreadyCheckedIn: boolean; competitorNumber?: number | null };

// Competitor numbers (#377), one per registration and competition: races, rejected commands and
// the operations that must not assign a number by themselves.
describe('competitor number regressions (e2e)', () => {
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

  // Passes: Full includes the workshop and both competitions (Competition, then Battle in the
  // agenda); Choice includes the workshop and makes Battle selectable; Workshop includes only the
  // workshop. Ana and Beto hold Full, Wen holds Workshop, Sol holds Choice without a selection, Pia
  // holds Full but is pending payment. Another event has its own registration and competition.
  async function fixture() {
    const [{ id: org }] = await client<{ id: string }[]>`
      INSERT INTO organizations (name) VALUES ('Org') RETURNING id`;
    const [event, other] = await client<{ id: string }[]>`
      INSERT INTO events (organization_id, name, time_zone)
      VALUES (${org}, 'One', 'Etc/UTC'), (${org}, 'Two', 'Etc/UTC') RETURNING id`;
    const [{ id: venue }] = await client<{ id: string }[]>`
      INSERT INTO venues (organization_id, name) VALUES (${org}, 'Hall') RETURNING id`;
    await client`
      INSERT INTO event_venues (organization_id, event_id, venue_id)
      VALUES (${org}, ${event.id}, ${venue}), (${org}, ${other.id}, ${venue})`;
    const [workshop, competition, battle, foreignCompetition] = await client<{ id: string }[]>`
      INSERT INTO activities (event_id, venue_id, kind, name, starts_at, ends_at)
      VALUES (${event.id}, ${venue}, 'workshop', 'Workshop', now(), now() + interval '1 hour'),
        (${event.id}, ${venue}, 'competition', 'Competition', now(), now() + interval '1 hour'),
        (${event.id}, ${venue}, 'competition', 'Battle', now() + interval '1 hour', now() + interval '2 hours'),
        (${other.id}, ${venue}, 'competition', 'Elsewhere', now(), now() + interval '1 hour')
      RETURNING id`;
    const [full, choice, workshopPass] = await client<{ id: string }[]>`
      INSERT INTO event_pass_types (event_id, name, pass_class, price_cents)
      VALUES (${event.id}, 'Full', 'full', 1000), (${event.id}, 'Choice', 'full', 900),
        (${event.id}, 'Workshop', 'add_on', 300)
      RETURNING id`;
    await client`
      INSERT INTO event_pass_type_activities (event_id, pass_type_id, activity_id, access)
      VALUES (${event.id}, ${full.id}, ${workshop.id}, 'included'),
        (${event.id}, ${full.id}, ${competition.id}, 'included'),
        (${event.id}, ${full.id}, ${battle.id}, 'included'),
        (${event.id}, ${choice.id}, ${workshop.id}, 'included'),
        (${event.id}, ${choice.id}, ${battle.id}, 'selectable'),
        (${event.id}, ${workshopPass.id}, ${workshop.id}, 'included')`;
    const register = async (eventId: string, name: string, confirmed: boolean) => {
      const [{ id }] = await client<{ id: string }[]>`
        WITH person AS (INSERT INTO participants (full_name) VALUES (${name}) RETURNING id)
        INSERT INTO event_registrations (event_id, participant_id, status, confirmation_source, confirmed_at, folio)
        SELECT ${eventId}, id, ${confirmed ? 'confirmed' : 'pending_payment'},
          ${confirmed ? 'admin_cash' : null}, CASE WHEN ${confirmed}::boolean THEN now() END,
          ${confirmed ? `F-${randomBytes(4).toString('hex')}` : null}
        FROM person RETURNING id`;
      return id;
    };
    const hold = async (registrationId: string, passTypeId: string) => {
      const [{ id }] = await client<{ id: string }[]>`
        INSERT INTO event_registration_passes (event_id, event_registration_id, pass_type_id, price_cents)
        VALUES (${event.id}, ${registrationId}, ${passTypeId}, 100) RETURNING id`;
      return id;
    };
    const ana = await register(event.id, 'Ana', true);
    const beto = await register(event.id, 'Beto', true);
    const wen = await register(event.id, 'Wen', true);
    const sol = await register(event.id, 'Sol', true);
    const pia = await register(event.id, 'Pia', false);
    await hold(ana, full.id);
    await hold(beto, full.id);
    await hold(wen, workshopPass.id);
    const solPass = await hold(sol, choice.id);
    await hold(pia, full.id);
    const foreign = await register(other.id, 'Foreign', true);
    return {
      event: event.id,
      other: other.id,
      workshop: workshop.id,
      competition: competition.id,
      battle: battle.id,
      foreignCompetition: foreignCompetition.id,
      ana,
      beto,
      wen,
      sol,
      solPass,
      pia,
      foreign,
    };
  }
  async function session(role: string, eventId: string) {
    const [{ id: userId }] = await client<{ id: string }[]>`
      INSERT INTO users (email, display_name, active)
      VALUES (${randomBytes(8).toString('hex') + '@example.com'}, 'Operator', true) RETURNING id`;
    await client`INSERT INTO user_roles (user_id, role, scope_type, scope_id) VALUES (${userId}, ${role}, 'event', ${eventId})`;
    const token = randomBytes(32).toString('hex');
    const [{ id: sessionId }] = await client<{ id: string }[]>`
      INSERT INTO auth_sessions (user_id, token_digest, expires_at)
      VALUES (${userId}, ${createHash('sha256').update(token).digest('hex')}, now() + interval '1 hour') RETURNING id`;
    return { cookie: `nb_admin_session=${token}`, userId, sessionId };
  }
  const origin = readTrustedOrigin(process.env);
  const headers = (cookie: string) => ({
    Cookie: cookie,
    Origin: origin,
    'X-CSRF-Token': createHash('sha256')
      .update(`nb-admin-csrf-v1:${cookie.slice('nb_admin_session='.length)}`)
      .digest('hex'),
  });
  const http = () => request(app.getHttpServer());
  const checkIn = (cookie: string, event: string, registration: string) =>
    http()
      .post(`/admin/events/${event}/registrations/${registration}/check-in`)
      .set(headers(cookie))
      .send({});
  const activityCheckIn = (cookie: string, event: string, registration: string, activity: string) =>
    http()
      .post(`/admin/events/${event}/registrations/${registration}/activities/${activity}/check-in`)
      .set(headers(cookie))
      .send({});
  const assign = (event: string, registration: string, activity: string) =>
    http().post(
      `/admin/events/${event}/registrations/${registration}/competitions/${activity}/competitor-number`,
    );
  // Every stored number as `registration:activity → number`.
  const numbers = async () =>
    Object.fromEntries(
      (
        await client<{ key: string; n: number }[]>`
          SELECT event_registration_id || ':' || activity_id AS key, competitor_number AS n
          FROM event_competitor_numbers`
      ).map((row) => [row.key, row.n]),
    );
  const numberOf = async (registration: string, activity: string) =>
    (
      await client<{ n: number }[]>`
        SELECT competitor_number AS n FROM event_competitor_numbers
        WHERE event_registration_id = ${registration} AND activity_id = ${activity}`
    )[0]?.n ?? null;
  const auditRows = () =>
    client`SELECT * FROM registration_operation_audit ORDER BY created_at, id`;
  const rowsHash = async () =>
    (
      await client<{ h: string }[]>`
        SELECT md5(
          coalesce((SELECT string_agg(r::text, '|' ORDER BY r.id) FROM event_registrations r), '') ||
          coalesce((SELECT string_agg(n::text, '|' ORDER BY n.event_registration_id, n.activity_id)
            FROM event_competitor_numbers n), '')
        ) AS h`
    )[0].h;
  const fullPass = async (event: string) =>
    (
      await client<{ id: string }[]>`
        SELECT id FROM event_pass_types WHERE event_id = ${event} AND name = 'Full'`
    )[0].id;

  it('many concurrent check-ins into one competition get distinct numbers 1..n', async () => {
    const s = await fixture();
    const { cookie } = await session('admin', s.event);
    const full = await fullPass(s.event);
    const extra: string[] = [];
    for (let i = 0; i < 8; i += 1) {
      const [{ id }] = await client<{ id: string }[]>`
        WITH person AS (INSERT INTO participants (full_name) VALUES (${'X' + i}) RETURNING id)
        INSERT INTO event_registrations (event_id, participant_id, status, confirmation_source, confirmed_at, folio)
        SELECT ${s.event}, id, 'confirmed', 'admin_cash', now(), ${'P-' + randomBytes(4).toString('hex')} FROM person RETURNING id`;
      await client`INSERT INTO event_registration_passes (event_id, event_registration_id, pass_type_id, price_cents)
        VALUES (${s.event}, ${id}, ${full}, 100)`;
      extra.push(id);
    }
    const all = [s.ana, s.beto, ...extra];
    // Half of them also enter the other competition at the same time, which numbers on its own.
    const results = await Promise.all([
      ...all.map((id) => activityCheckIn(cookie, s.event, id, s.competition)),
      ...all.filter((_, i) => i % 2).map((id) => activityCheckIn(cookie, s.event, id, s.battle)),
    ]);
    expect(results.every((r) => r.status === 201)).toBe(true);
    const got = results.map((r) => (r.body as CheckInBody).competitorNumber as number);
    const competition = got.slice(0, all.length);
    const battle = got.slice(all.length);
    expect([...competition].sort((a, b) => a - b)).toEqual(all.map((_, i) => i + 1));
    expect([...battle].sort((a, b) => a - b)).toEqual(battle.map((_, i) => i + 1));
  });

  it('admin assignment racing a check-in of another registration gets distinct numbers', async () => {
    const s = await fixture();
    const { cookie } = await session('admin', s.event);
    const holder = await client.reserve();
    try {
      await holder`BEGIN`;
      await holder`SELECT pg_advisory_xact_lock(hashtext(${`competitor-number:${s.battle}`}))`;
      const pending = Promise.all([
        assign(s.event, s.ana, s.battle).set(headers(cookie)),
        activityCheckIn(cookie, s.event, s.beto, s.battle),
      ]);
      for (let attempt = 0; attempt < 100; attempt += 1) {
        const [{ waiting }] = await client<{ waiting: number }[]>`
          SELECT count(*)::int AS waiting FROM pg_locks WHERE locktype = 'advisory' AND NOT granted`;
        if (waiting === 2) break;
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      await holder`COMMIT`;
      const [a, b] = await pending;
      expect([a.status, b.status]).toEqual([201, 201]);
      const nums = [
        (a.body as { competitorNumber: number }).competitorNumber,
        (b.body as CheckInBody).competitorNumber,
      ];
      expect([...nums].sort()).toEqual([1, 2]);
    } finally {
      holder.release();
    }
  });

  it('admin assignment racing a check-in of the SAME registration serializes', async () => {
    const s = await fixture();
    const { cookie } = await session('admin', s.event);
    const [x, y] = await Promise.all([
      assign(s.event, s.ana, s.battle).set(headers(cookie)),
      activityCheckIn(cookie, s.event, s.ana, s.battle),
    ]);
    expect([x.status, y.status]).toEqual([201, 201]);
    const final = await numberOf(s.ana, s.battle);
    const adminNum = (x.body as { competitorNumber: number }).competitorNumber;
    const checkNum = (y.body as CheckInBody).competitorNumber;
    // Either order: check-in first gives 1 then admin retires to 2; admin first gives 1, check-in keeps 1.
    expect(final).toBe(adminNum);
    expect([1, 2]).toContain(final);
    expect(checkNum === adminNum || (checkNum === 1 && adminNum === 2)).toBe(true);
  });

  it('mixed concurrent flows never deadlock or 500', async () => {
    const s = await fixture();
    const { cookie } = await session('admin', s.event);
    for (let round = 0; round < 6; round += 1) {
      const results = await Promise.all([
        checkIn(cookie, s.event, s.ana),
        activityCheckIn(cookie, s.event, s.ana, s.competition),
        assign(s.event, s.ana, s.competition).set(headers(cookie)),
        assign(s.event, s.beto, s.battle).set(headers(cookie)),
        activityCheckIn(cookie, s.event, s.beto, s.battle),
        http()
          .put(`/admin/events/${s.event}/registrations/${s.sol}/passes/${s.solPass}/selections`)
          .set(headers(cookie))
          .send({ activityIds: round % 2 ? [] : [s.battle], reason: 'Toggle' }),
        activityCheckIn(cookie, s.event, s.sol, s.battle),
        activityCheckIn(cookie, s.event, s.wen, s.workshop),
        http().get(`/admin/events/${s.event}/attendee-lists`).set(headers(cookie)),
      ]);
      for (const r of results) expect(r.status).toBeLessThan(500);
    }
    const rows = await client<{ activity_id: string; n: number }[]>`
      SELECT activity_id, competitor_number AS n FROM event_competitor_numbers`;
    const keys = rows.map((r) => `${r.activity_id}:${r.n}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('an archived competition takes no check-in and no admin assignment', async () => {
    const s = await fixture();
    const { cookie } = await session('admin', s.event);
    await client`UPDATE activities SET status = 'archived' WHERE id = ${s.competition}`;
    await activityCheckIn(cookie, s.event, s.ana, s.competition).expect(400);
    await assign(s.event, s.ana, s.competition).set(headers(cookie)).expect(409);
    expect(await numbers()).toEqual({});
  });

  it('voided and pending registrations never get a number', async () => {
    const s = await fixture();
    const { cookie } = await session('admin', s.event);
    await activityCheckIn(cookie, s.event, s.pia, s.competition).expect(400);
    await client`UPDATE event_registrations SET status = 'voided' WHERE id = ${s.pia}`;
    await activityCheckIn(cookie, s.event, s.pia, s.competition).expect(400);
    await assign(s.event, s.pia, s.competition).set(headers(cookie)).expect(409);
    expect(await numbers()).toEqual({});
  });

  it('rejected admin commands leave registrations and numbers byte-identical', async () => {
    const s = await fixture();
    const { cookie } = await session('admin', s.event);
    await activityCheckIn(cookie, s.event, s.ana, s.competition).expect(201);
    const before = await rowsHash();
    const auditBefore = (await auditRows()).length;
    await assign(s.event, s.wen, s.battle).set(headers(cookie)).expect(409);
    await assign(s.event, s.sol, s.battle).set(headers(cookie)).expect(409);
    await assign(s.event, s.pia, s.battle).set(headers(cookie)).expect(409);
    await assign(s.event, s.ana, s.workshop).set(headers(cookie)).expect(409);
    await assign(s.event, randomUUID(), s.battle).set(headers(cookie)).expect(404);
    await client`UPDATE activities SET status = 'archived' WHERE id = ${s.competition}`;
    await assign(s.event, s.ana, s.competition).set(headers(cookie)).expect(409);
    expect(await rowsHash()).toBe(before);
    expect((await auditRows()).length).toBe(auditBefore);
  });

  it('a discipline swap and a pass-type access change assign nothing by themselves', async () => {
    const s = await fixture();
    const { cookie } = await session('admin', s.event);
    // A real discipline swap: Ana trades Full for Choice (same price, as a swap requires) and
    // picks the battle.
    const choice = (
      await client<{ id: string }[]>`
        UPDATE event_pass_types SET price_cents = 1000
        WHERE event_id = ${s.event} AND name = 'Choice' RETURNING id`
    )[0].id;
    await http()
      .post(`/admin/events/${s.event}/registrations/${s.ana}/discipline-swap`)
      .set(headers(cookie))
      .send({ toPassTypeId: choice, activityIds: [s.battle], reason: 'Changed style' })
      .expect(200);
    // A pass-type access change: the Workshop pass now includes the competition for Wen.
    const [{ id: workshopPass, version }] = await client<{ id: string; version: number }[]>`
      SELECT id, version FROM event_pass_types WHERE event_id = ${s.event} AND name = 'Workshop'`;
    await http()
      .put(`/admin/events/${s.event}/pass-types/${workshopPass}/activities`)
      .set(headers(cookie))
      .send({
        expectedVersion: version,
        activities: [
          { activityId: s.workshop, access: 'included' },
          { activityId: s.competition, access: 'included' },
        ],
      })
      .expect(200);
    expect(await numbers()).toEqual({});
    // The next check-in into each competition numbers them.
    const ana = await activityCheckIn(cookie, s.event, s.ana, s.battle).expect(201);
    expect((ana.body as CheckInBody).competitorNumber).toBe(1);
    const wen = await activityCheckIn(cookie, s.event, s.wen, s.competition).expect(201);
    expect((wen.body as CheckInBody).competitorNumber).toBe(1);
  });
});
