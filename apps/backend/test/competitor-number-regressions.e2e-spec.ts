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

type CheckInBody = { alreadyCheckedIn: boolean; competitorNumber: number | null };

// Competitor numbers (#377): assigned on the first event or activity check-in of an eligible
// registration, or by an administrator, always as the event's highest number plus one.
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

  // Passes: Full includes the workshop and the competition; Choice makes Battle selectable;
  // Workshop includes only the workshop. Ana and Beto hold Full, Wen holds Workshop, Sol holds
  // Choice without a selection, Pia holds Full but is pending payment. Another event has its own
  // competitor holding number 1, which must not count.
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
    const [workshop, competition, battle] = await client<{ id: string }[]>`
      INSERT INTO activities (event_id, venue_id, kind, name, starts_at, ends_at)
      VALUES (${event.id}, ${venue}, 'workshop', 'Workshop', now(), now() + interval '1 hour'),
        (${event.id}, ${venue}, 'competition', 'Competition', now(), now() + interval '1 hour'),
        (${event.id}, ${venue}, 'competition', 'Battle', now(), now() + interval '1 hour')
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
    await client`UPDATE event_registrations SET competitor_number = 1 WHERE id = ${foreign}`;
    return {
      event: event.id,
      other: other.id,
      workshop: workshop.id,
      competition: competition.id,
      battle: battle.id,
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
  const assign = (event: string, registration: string) =>
    http().post(`/admin/events/${event}/registrations/${registration}/competitor-number`);
  const numberOf = async (registration: string) =>
    (
      await client<{ n: number | null }[]>`
        SELECT competitor_number AS n FROM event_registrations WHERE id = ${registration}`
    )[0].n;
  const auditRows = () =>
    client`SELECT * FROM registration_operation_audit ORDER BY created_at, id`;
  const rowsHash = async () =>
    (
      await client<{ h: string }[]>`
        SELECT md5(string_agg(r::text, '|' ORDER BY r.id)) AS h FROM event_registrations r`
    )[0].h;

  it('many concurrent check-ins of different competitors get distinct numbers 1..n', async () => {
    const s = await fixture();
    const { cookie } = await session('admin', s.event);
    const [{ id: full }] = await client<{ id: string }[]>`
      SELECT id FROM event_pass_types WHERE event_id = ${s.event} AND name = 'Full'`;
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
    const results = await Promise.all(
      all.map((id, i) =>
        i % 2 ? activityCheckIn(cookie, s.event, id, s.workshop) : checkIn(cookie, s.event, id),
      ),
    );
    expect(results.map((r) => r.status)).toEqual(all.map(() => 201));
    const got = results.map((r) => (r.body as CheckInBody).competitorNumber as number);
    expect([...got].sort((a, b) => a - b)).toEqual(all.map((_, i) => i + 1));
  });

  it('admin assignment racing a check-in of another registration gets distinct numbers', async () => {
    const s = await fixture();
    const { cookie } = await session('admin', s.event);
    const holder = await client.reserve();
    try {
      await holder`BEGIN`;
      await holder`SELECT pg_advisory_xact_lock(hashtext(${`competitor-number:${s.event}`}))`;
      const pending = Promise.all([
        assign(s.event, s.ana).set(headers(cookie)),
        checkIn(cookie, s.event, s.beto),
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
      assign(s.event, s.ana).set(headers(cookie)),
      checkIn(cookie, s.event, s.ana),
    ]);
    expect([x.status, y.status]).toEqual([201, 201]);
    const final = await numberOf(s.ana);
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
        assign(s.event, s.ana).set(headers(cookie)),
        assign(s.event, s.beto).set(headers(cookie)),
        activityCheckIn(cookie, s.event, s.beto, s.competition),
        http()
          .put(`/admin/events/${s.event}/registrations/${s.sol}/passes/${s.solPass}/selections`)
          .set(headers(cookie))
          .send({ activityIds: round % 2 ? [] : [s.battle], reason: 'Toggle' }),
        checkIn(cookie, s.event, s.sol),
        activityCheckIn(cookie, s.event, s.wen, s.workshop),
        http().get(`/admin/events/${s.event}/attendee-lists`).set(headers(cookie)),
      ]);
      for (const r of results) expect(r.status).toBeLessThan(500);
    }
    const rows = await client<{ n: number }[]>`
      SELECT competitor_number AS n FROM event_registrations WHERE event_id = ${s.event} AND competitor_number IS NOT NULL`;
    expect(new Set(rows.map((r) => r.n)).size).toBe(rows.length);
  });

  it('an archived included competition does not make a competitor', async () => {
    const s = await fixture();
    const { cookie } = await session('admin', s.event);
    await client`UPDATE activities SET status = 'archived' WHERE id = ${s.competition}`;
    const r = await checkIn(cookie, s.event, s.ana).expect(201);
    expect((r.body as CheckInBody).competitorNumber).toBeNull();
    await assign(s.event, s.ana).set(headers(cookie)).expect(409);
  });

  it('a selected but archived selectable competition does not count', async () => {
    const s = await fixture();
    const { cookie } = await session('admin', s.event);
    await http()
      .put(`/admin/events/${s.event}/registrations/${s.sol}/passes/${s.solPass}/selections`)
      .set(headers(cookie))
      .send({ activityIds: [s.battle], reason: 'Chose' })
      .expect(200);
    await client`UPDATE activities SET status = 'archived' WHERE id = ${s.battle}`;
    const r = await checkIn(cookie, s.event, s.sol).expect(201);
    expect((r.body as CheckInBody).competitorNumber).toBeNull();
  });

  it('voided and pending registrations never get a number on check-in', async () => {
    const s = await fixture();
    const { cookie } = await session('admin', s.event);
    await checkIn(cookie, s.event, s.pia).expect(400);
    await client`UPDATE event_registrations SET status = 'voided' WHERE id = ${s.pia}`;
    await checkIn(cookie, s.event, s.pia).expect(400);
    await assign(s.event, s.pia).set(headers(cookie)).expect(409);
    expect(await numberOf(s.pia)).toBeNull();
  });

  it('rejected admin commands leave every registration row byte-identical', async () => {
    const s = await fixture();
    const { cookie } = await session('admin', s.event);
    await checkIn(cookie, s.event, s.ana).expect(201);
    const before = await rowsHash();
    const auditBefore = (await auditRows()).length;
    await assign(s.event, s.wen).set(headers(cookie)).expect(409);
    await assign(s.event, s.sol).set(headers(cookie)).expect(409);
    await assign(s.event, s.pia).set(headers(cookie)).expect(409);
    await assign(s.event, randomUUID()).set(headers(cookie)).expect(404);
    await client`UPDATE activities SET status = 'archived' WHERE id = ${s.competition}`;
    await assign(s.event, s.ana).set(headers(cookie)).expect(409);
    expect(await rowsHash()).toBe(before);
    expect((await auditRows()).length).toBe(auditBefore);
  });

  it('a registration of another event is 404 and the bad uuid is 400', async () => {
    const s = await fixture();
    const { cookie } = await session('admin', s.event);
    const r = await assign(s.event, s.foreign).set(headers(cookie));
    expect(r.status).toBe(404);
    await assign(s.event, 'not-a-uuid').set(headers(cookie)).expect(400);
  });

  it('attendee lists order: numbered ascending then alphabetical', async () => {
    const s = await fixture();
    const { cookie } = await session('admin', s.event);
    await checkIn(cookie, s.event, s.beto).expect(201); // 1
    await checkIn(cookie, s.event, s.ana).expect(201); // 2
    await assign(s.event, s.beto).set(headers(cookie)).expect(201); // beto -> 3
    const body = (
      await http().get(`/admin/events/${s.event}/attendee-lists`).set(headers(cookie)).expect(200)
    ).body as { registrations: { fullName: string; competitorNumber: number | null }[] };
    expect(body.registrations.map((r) => [r.fullName, r.competitorNumber])).toEqual([
      ['Ana', 2],
      ['Beto', 3],
      ['Pia', null],
      ['Sol', null],
      ['Wen', null],
    ]);
  });

  it('discipline swap and pass-type access change assign nothing', async () => {
    const s = await fixture();
    const { cookie } = await session('admin', s.event);
    await checkIn(cookie, s.event, s.wen).expect(201);
    const [{ id: wpass, version: wver }] = await client<{ id: string; version: number }[]>`
      SELECT id, version FROM event_pass_types WHERE event_id = ${s.event} AND name = 'Workshop'`;
    const r = await http()
      .put(`/admin/events/${s.event}/pass-types/${wpass}/activities`)
      .set(headers(cookie))

      .send({
        expectedVersion: wver,
        activities: [
          { activityId: s.workshop, access: 'included' },
          { activityId: s.competition, access: 'included' },
        ],
      });
    // Whatever the endpoint shape, no number must be assigned by it.
    expect(await numberOf(s.wen)).toBeNull();
    console.log(
      'pass-type activities change status',
      r.status,
      JSON.stringify(r.body).slice(0, 200),
    );
    expect(r.status).toBe(200);
    {
      const next = await checkIn(cookie, s.event, s.wen).expect(201);
      expect((next.body as CheckInBody).competitorNumber).toBe(1);
    }
  });
});
