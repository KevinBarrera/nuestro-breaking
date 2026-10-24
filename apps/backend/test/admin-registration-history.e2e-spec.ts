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

type Item = {
  id: string;
  occurredAt: string;
  operationType: string;
  actor: { kind: string; name: string | null };
  registration: { id: string; folio: string | null; participantName: string };
  reason: string | null;
  details: Record<string, unknown>;
};
type Page = { items: Item[]; nextCursor: string | null };

// Event registration history (#104): a redacted, cursor-paginated read of every audit fact of the
// event, newest first, for its administrators only.
describe('admin registration history (e2e)', () => {
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

  // Breaking and Popping full passes at the same price, a free general pass and an add-on.
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
    const [breaking, breaking2v2, popping] = await client<{ id: string }[]>`
      INSERT INTO activities (event_id, venue_id, kind, name, starts_at, ends_at, status)
      VALUES (${event.id}, ${venue}, 'competition', 'Breaking 1v1', '2026-11-20T18:00:00Z', '2026-11-20T20:00:00Z', 'active'),
        (${event.id}, ${venue}, 'competition', 'Breaking 2v2', '2026-11-21T18:00:00Z', '2026-11-21T20:00:00Z', 'active'),
        (${event.id}, ${venue}, 'competition', 'Popping 1v1', '2026-11-20T15:00:00Z', '2026-11-20T17:00:00Z', 'active')
      RETURNING id`;
    const [fullBreaking, fullPopping, general, guest] = await client<{ id: string }[]>`
      INSERT INTO event_pass_types (event_id, name, pass_class, price_cents)
      VALUES (${event.id}, 'Full breaking', 'full', 100000),
        (${event.id}, 'Full popping', 'full', 100000),
        (${event.id}, 'General', 'general', 50000),
        (${event.id}, 'Guest', 'general', 0)
      RETURNING id`;
    await client`INSERT INTO event_pass_type_activities (event_id, pass_type_id, activity_id, access)
      VALUES (${event.id}, ${fullBreaking.id}, ${breaking.id}, 'selectable'),
        (${event.id}, ${fullBreaking.id}, ${breaking2v2.id}, 'selectable'),
        (${event.id}, ${fullPopping.id}, ${popping.id}, 'selectable')`;
    return {
      event: event.id,
      other: other.id,
      breaking: breaking.id,
      breaking2v2: breaking2v2.id,
      popping: popping.id,
      fullBreaking: fullBreaking.id,
      fullPopping: fullPopping.id,
      general: general.id,
      guest: guest.id,
    };
  }
  async function session(role: string, eventId: string, displayName: string | null = 'Operator') {
    const email = randomBytes(8).toString('hex') + '@admins.example';
    const [{ id: userId }] = await client<
      { id: string }[]
    >`INSERT INTO users (email, display_name, active) VALUES (${email}, ${displayName}, true) RETURNING id`;
    await client`INSERT INTO user_roles (user_id, role, scope_type, scope_id) VALUES (${userId}, ${role}, 'event', ${eventId})`;
    const token = randomBytes(32).toString('hex');
    const [{ id: sessionId }] = await client<
      { id: string }[]
    >`INSERT INTO auth_sessions (user_id, token_digest, expires_at) VALUES (${userId}, ${createHash('sha256').update(token).digest('hex')}, now() + interval '1 hour') RETURNING id`;
    return { cookie: `nb_admin_session=${token}`, userId, sessionId, email };
  }
  // A registration written directly, with a participant whose contact data must never leak.
  async function registration(eventId: string, n: number, online = false) {
    const [{ id: participantId }] = await client<{ id: string }[]>`
      INSERT INTO participants (full_name, email, phone)
      VALUES (${`Direct ${n}`}, ${`direct${n}@buyers.example`}, ${`+52 55 9900 00${String(n).padStart(2, '0')}`})
      RETURNING id`;
    const expiresAt = online ? new Date(Date.now() + 3_600_000).toISOString() : null;
    const [{ id }] = await client<{ id: string }[]>`
      INSERT INTO event_registrations (event_id, participant_id, expires_at)
      VALUES (${eventId}, ${participantId}, ${expiresAt}) RETURNING id`;
    return { id, participantId };
  }
  async function fact(
    reg: { id: string; participantId: string },
    eventId: string,
    values: {
      type: string;
      kind: 'public' | 'system';
      createdAt?: string;
      amountCents?: number | null;
      reference?: string | null;
      before?: unknown;
      after?: unknown;
      facts?: unknown;
    },
  ) {
    const [{ id }] = await client<{ id: string }[]>`
      INSERT INTO registration_operation_audit (operation_type, actor_kind, event_id, registration_id,
        participant_id, amount_cents, reference, before_state, after_state, facts, created_at)
      VALUES (${values.type}, ${values.kind}, ${eventId}, ${reg.id}, ${reg.participantId},
        ${values.amountCents ?? null}, ${values.reference ?? null},
        ${JSON.stringify(values.before ?? {})}::jsonb, ${JSON.stringify(values.after ?? {})}::jsonb,
        ${JSON.stringify(values.facts ?? {})}::jsonb,
        coalesce(${values.createdAt ?? null}::timestamptz, clock_timestamp()))
      RETURNING id`;
    return id;
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
  const history = (event: string, query = '') =>
    server().get(`/admin/events/${event}/registration-history${query}`);
  const person = (n: number) => ({
    firstName: `Person${n}`,
    firstLastName: 'Test',
    email: `person${n}@buyers.example`,
    phone: `55000000${String(n).padStart(2, '0')}`,
  });

  // Every operation type through the real admin routes, plus the public and system facts the
  // purchase flow and the webhook write.
  async function seedEveryOperation() {
    const f = await fixture();
    const admin = await session('admin', f.event);
    const unnamed = await session('admin', f.event, '');
    const h = headers(admin.cookie);
    const base = `/admin/events/${f.event}/registrations`;
    const created = await server().post(`${base}/manual`).set(h).send(person(1)).expect(201);
    const reg1 = (created.body as { registrationId: string }).registrationId;
    const assigned = await server()
      .post(`${base}/${reg1}/passes`)
      .set(h)
      .send({ passTypeId: f.fullBreaking })
      .expect(201);
    const passId = (assigned.body as { passes: { registrationPassId: string }[] }).passes[0]
      .registrationPassId;
    await server()
      .put(`${base}/${reg1}/passes/${passId}/selections`)
      .set(h)
      .send({ activityIds: [f.breaking] })
      .expect(200);
    await server()
      .post(`${base}/${reg1}/cash-confirmation`)
      .set(h)
      .send({ amount: 100000, receipt: 'R-1', reference: 'REF-SECRET-9', note: 'Paid at door' })
      .expect(201);
    await server()
      .put(`${base}/${reg1}/passes/${passId}/selections`)
      .set(h)
      .send({ activityIds: [f.breaking2v2], reason: 'Wrong battle' })
      .expect(200);
    await server()
      .post(`${base}/${reg1}/cash-correction`)
      .set(h)
      .send({ amountCents: 90000, receipt: 'R-2', reason: 'Typo', receiptChecked: true })
      .expect(200);
    await server()
      .post(`${base}/${reg1}/participant-correction`)
      .set(h)
      .send({ firstName: 'Persona', firstLastName: 'Test', reason: 'Misspelled' })
      .expect(200);
    await server()
      .post(`${base}/${reg1}/discipline-swap`)
      .set(h)
      .send({ toPassTypeId: f.fullPopping, activityIds: [f.popping], reason: 'Changed style' })
      .expect(200);

    const hu = headers(unnamed.cookie);
    const second = await server().post(`${base}/manual`).set(hu).send(person(2)).expect(201);
    const reg2 = (second.body as { registrationId: string }).registrationId;
    await server().post(`${base}/${reg2}/passes`).set(hu).send({ passTypeId: f.guest }).expect(201);
    await server()
      .post(`${base}/${reg2}/complimentary-confirmation`)
      .set(hu)
      .send({ reason: 'Golden ticket' })
      .expect(201);

    const third = await server().post(`${base}/manual`).set(h).send(person(3)).expect(201);
    const reg3 = (third.body as { registrationId: string }).registrationId;
    const general = await server()
      .post(`${base}/${reg3}/passes`)
      .set(h)
      .send({ passTypeId: f.general })
      .expect(201);
    const generalId = (general.body as { passes: { registrationPassId: string }[] }).passes[0]
      .registrationPassId;
    await server().delete(`${base}/${reg3}/passes/${generalId}`).set(h).expect(200);
    await server().post(`${base}/${reg3}/void`).set(h).send({ reason: 'Duplicate' }).expect(200);

    const online = await registration(f.event, 4, true);
    await fact(online, f.event, {
      type: 'online_registration',
      kind: 'public',
      before: { registration: null },
      after: { status: 'pending_payment', participantId: online.participantId, passes: [] },
      facts: { participantCreated: true, registrationReused: false },
    });
    await client`UPDATE event_registrations SET status = 'confirmed', confirmation_source = 'approved_payment',
      confirmed_at = now(), folio = 'F-ONLINE' WHERE id = ${online.id}`;
    await fact(online, f.event, {
      type: 'payment_approval',
      kind: 'system',
      amountCents: 103000,
      reference: 'MP-SECRET-777',
      before: {
        status: 'pending_payment',
        confirmationSource: null,
        confirmedAt: null,
        folio: null,
      },
      after: { status: 'confirmed', confirmationSource: 'approved_payment', folio: 'F-ONLINE' },
      facts: { providerPaymentId: 'MP-SECRET-777', checkoutId: 'checkout-secret' },
    });
    const expired = await registration(f.event, 5, true);
    await client`UPDATE event_registrations SET status = 'voided' WHERE id = ${expired.id}`;
    await fact(expired, f.event, {
      type: 'registration_expiry',
      kind: 'system',
      before: { status: 'pending_payment', expiresAt: '2026-10-01T00:00:00.000Z' },
      after: { status: 'voided' },
      facts: { reason: 'payment_window_expired' },
    });

    // Archived catalog entries keep their names in the history.
    await client`UPDATE event_pass_types SET status = 'archived' WHERE id = ${f.fullBreaking}`;
    await client`UPDATE activities SET status = 'archived' WHERE id = ${f.breaking2v2}`;
    const folioOf = async (id: string) =>
      (
        await client<
          { folio: string | null }[]
        >`SELECT folio FROM event_registrations WHERE id = ${id}`
      )[0].folio;
    const [folio, folio2] = [await folioOf(reg1), await folioOf(reg2)];
    return { f, admin, unnamed, reg1, reg2, reg3, online, expired, folio, folio2 };
  }

  it('returns every operation type newest first with actors, reasons and resolved details (#104)', async () => {
    const s = await seedEveryOperation();
    const response = await history(s.f.event).set('Cookie', s.admin.cookie).expect(200);
    const page = response.body as Page;
    expect(page.nextCursor).toBeNull();
    expect(page.items.map((item) => item.operationType)).toEqual([
      'registration_expiry',
      'payment_approval',
      'online_registration',
      'registration_void',
      'pass_removal',
      'pass_assignment',
      'manual_registration',
      'complimentary_confirmation',
      'pass_assignment',
      'manual_registration',
      'registration_discipline_swap',
      'registration_correction',
      'cash_correction',
      'pass_selection_change',
      'cash_confirmation',
      'pass_selection_change',
      'pass_assignment',
      'manual_registration',
    ]);
    const operator = { kind: 'admin', name: 'Operator' };
    const reg1 = { id: s.reg1, folio: s.folio, participantName: 'Persona Test' };
    const reg2 = { id: s.reg2, folio: s.folio2, participantName: 'Person2 Test' };
    expect(s.folio).not.toBeNull();
    expect(s.folio2).not.toBeNull();
    const byType = (items: Item[]) =>
      items.map(({ operationType, actor, registration, reason, details }) => ({
        operationType,
        actor,
        registration,
        reason,
        details,
      }));
    expect(byType(page.items)).toEqual([
      {
        operationType: 'registration_expiry',
        actor: { kind: 'system', name: null },
        registration: { id: s.expired.id, folio: null, participantName: 'Direct 5' },
        reason: null,
        details: { kind: 'registration_expiry', fromStatus: 'pending_payment', toStatus: 'voided' },
      },
      {
        operationType: 'payment_approval',
        actor: { kind: 'system', name: null },
        registration: { id: s.online.id, folio: 'F-ONLINE', participantName: 'Direct 4' },
        reason: null,
        details: { kind: 'payment_approval', amountCents: 103000, lateApproval: false },
      },
      {
        operationType: 'online_registration',
        actor: { kind: 'public', name: null },
        registration: { id: s.online.id, folio: 'F-ONLINE', participantName: 'Direct 4' },
        reason: null,
        details: { kind: 'online_registration' },
      },
      {
        operationType: 'registration_void',
        actor: operator,
        registration: { id: s.reg3, folio: null, participantName: 'Person3 Test' },
        reason: 'Duplicate',
        details: { kind: 'registration_void', fromStatus: 'pending_payment', toStatus: 'voided' },
      },
      {
        operationType: 'pass_removal',
        actor: operator,
        registration: { id: s.reg3, folio: null, participantName: 'Person3 Test' },
        reason: null,
        details: { kind: 'pass_removal', passTypeName: 'General' },
      },
      {
        operationType: 'pass_assignment',
        actor: operator,
        registration: { id: s.reg3, folio: null, participantName: 'Person3 Test' },
        reason: null,
        details: { kind: 'pass_assignment', passTypeName: 'General' },
      },
      {
        operationType: 'manual_registration',
        actor: operator,
        registration: { id: s.reg3, folio: null, participantName: 'Person3 Test' },
        reason: null,
        details: { kind: 'manual_registration' },
      },
      {
        operationType: 'complimentary_confirmation',
        actor: { kind: 'admin', name: null },
        registration: reg2,
        reason: 'Golden ticket',
        details: { kind: 'complimentary_confirmation' },
      },
      {
        operationType: 'pass_assignment',
        actor: { kind: 'admin', name: null },
        registration: reg2,
        reason: null,
        details: { kind: 'pass_assignment', passTypeName: 'Guest' },
      },
      {
        operationType: 'manual_registration',
        actor: { kind: 'admin', name: null },
        registration: reg2,
        reason: null,
        details: { kind: 'manual_registration' },
      },
      {
        operationType: 'registration_discipline_swap',
        actor: operator,
        registration: reg1,
        reason: 'Changed style',
        details: {
          kind: 'registration_discipline_swap',
          fromPassTypeName: 'Full breaking',
          toPassTypeName: 'Full popping',
          fromActivityNames: ['Breaking 2v2'],
          toActivityNames: ['Popping 1v1'],
        },
      },
      {
        operationType: 'registration_correction',
        actor: operator,
        registration: reg1,
        reason: 'Misspelled',
        details: { kind: 'registration_correction', changedFields: ['firstName'] },
      },
      {
        operationType: 'cash_correction',
        actor: operator,
        registration: reg1,
        reason: 'Typo',
        details: {
          kind: 'cash_correction',
          previous: { amountCents: 100000, receipt: 'R-1' },
          current: { amountCents: 90000, receipt: 'R-2' },
        },
      },
      {
        operationType: 'pass_selection_change',
        actor: operator,
        registration: reg1,
        reason: 'Wrong battle',
        details: {
          kind: 'pass_selection_change',
          passTypeName: 'Full breaking',
          fromActivityNames: ['Breaking 1v1'],
          toActivityNames: ['Breaking 2v2'],
        },
      },
      {
        operationType: 'cash_confirmation',
        actor: operator,
        registration: reg1,
        reason: null,
        details: { kind: 'cash_confirmation', amountCents: 100000, receipt: 'R-1' },
      },
      {
        operationType: 'pass_selection_change',
        actor: operator,
        registration: reg1,
        reason: null,
        details: {
          kind: 'pass_selection_change',
          passTypeName: 'Full breaking',
          fromActivityNames: [],
          toActivityNames: ['Breaking 1v1'],
        },
      },
      {
        operationType: 'pass_assignment',
        actor: operator,
        registration: reg1,
        reason: null,
        details: { kind: 'pass_assignment', passTypeName: 'Full breaking' },
      },
      {
        operationType: 'manual_registration',
        actor: operator,
        registration: reg1,
        reason: null,
        details: { kind: 'manual_registration' },
      },
    ]);
    for (const item of page.items) {
      expect(Object.keys(item).sort()).toEqual(
        ['actor', 'details', 'id', 'occurredAt', 'operationType', 'reason', 'registration'].sort(),
      );
      expect(new Date(item.occurredAt).toISOString()).toBe(item.occurredAt);
    }
  });

  it('never exposes contact data, sessions, payment references or stored states (#104)', async () => {
    const s = await seedEveryOperation();
    const response = await history(s.f.event).set('Cookie', s.admin.cookie).expect(200);
    const serialized = JSON.stringify(response.body);
    const participants = await client<
      { email: string | null; phone: string | null }[]
    >`SELECT email, phone FROM participants`;
    const sessions = await client<{ id: string }[]>`SELECT id FROM auth_sessions`;
    const users = await client<{ id: string; email: string }[]>`SELECT id, email FROM users`;
    const forbidden = [
      ...participants.flatMap((row) => [row.email, row.phone]),
      ...sessions.map((row) => row.id),
      ...users.flatMap((row) => [row.id, row.email]),
      'MP-SECRET-777',
      'checkout-secret',
      'REF-SECRET-9',
      'Paid at door',
      'Person1',
      'beforeState',
      'before_state',
      'afterState',
      'facts',
      'sessionId',
      '@',
    ].filter((value): value is string => !!value);
    expect(forbidden.length).toBeGreaterThan(10);
    for (const value of forbidden) expect(serialized).not.toContain(value);
  });

  it('keeps only corrections, including selection changes of confirmed registrations (#104)', async () => {
    const s = await seedEveryOperation();
    const response = await history(s.f.event, '?filter=corrections')
      .set('Cookie', s.admin.cookie)
      .expect(200);
    const page = response.body as Page;
    expect(page.items.map((item) => [item.operationType, item.reason])).toEqual([
      ['registration_void', 'Duplicate'],
      ['registration_discipline_swap', 'Changed style'],
      ['registration_correction', 'Misspelled'],
      ['cash_correction', 'Typo'],
      ['pass_selection_change', 'Wrong battle'],
    ]);
    const all = await history(s.f.event, '?filter=all').set('Cookie', s.admin.cookie).expect(200);
    expect((all.body as Page).items).toHaveLength(18);
  });

  it('keeps on-site registrations and complimentary passes with counts per type (#356)', async () => {
    const s = await seedEveryOperation();
    const read = async (query: string) =>
      (await history(s.f.event, query).set('Cookie', s.admin.cookie).expect(200)).body as Page & {
        counts: Record<string, number>;
      };
    const counts = { all: 18, corrections: 5, on_site: 3, complimentary: 1 };
    const onSite = await read('?filter=on_site');
    expect(onSite.items.map((item) => [item.operationType, item.registration.id])).toEqual([
      ['pass_assignment', s.reg3],
      ['manual_registration', s.reg3],
      ['pass_assignment', s.reg2],
      ['manual_registration', s.reg2],
      ['cash_confirmation', s.reg1],
      ['pass_assignment', s.reg1],
      ['manual_registration', s.reg1],
    ]);
    expect(onSite.counts).toEqual(counts);
    const complimentary = await read('?filter=complimentary');
    expect(complimentary.items.map((item) => [item.operationType, item.reason])).toEqual([
      ['complimentary_confirmation', 'Golden ticket'],
    ]);
    expect(complimentary.counts).toEqual(counts);
    // A pass added to an online sale is not an on-site registration.
    await fact(s.online, s.f.event, { type: 'pass_assignment', kind: 'public' });
    expect((await read('?filter=on_site')).items).toHaveLength(7);
    expect((await read('?filter=corrections')).counts).toEqual({ ...counts, all: 19 });
  });

  it('searches names, AKA, folios, receipts and shown reasons (#356)', async () => {
    const s = await seedEveryOperation();
    const read = async (query: string) =>
      (await history(s.f.event, query).set('Cookie', s.admin.cookie).expect(200)).body as Page & {
        counts: Record<string, number>;
      };
    const types = (page: Page) => page.items.map((item) => item.operationType);
    const reg1Types = [
      'registration_discipline_swap',
      'registration_correction',
      'cash_correction',
      'pass_selection_change',
      'cash_confirmation',
      'pass_selection_change',
      'pass_assignment',
      'manual_registration',
    ];
    // Name, case- and accent-insensitive, against the participant's current name.
    await client`UPDATE participants SET full_name = 'Pérsón Dos' WHERE id =
      (SELECT participant_id FROM event_registrations WHERE id = ${s.reg2})`;
    const byName = await read(`?q=${encodeURIComponent('PERSON dos')}`);
    expect(types(byName)).toEqual([
      'complimentary_confirmation',
      'pass_assignment',
      'manual_registration',
    ]);
    expect(byName.counts).toEqual({ all: 3, corrections: 0, on_site: 1, complimentary: 1 });
    // AKA.
    await client`UPDATE participants SET stage_name = 'B-Boy Ñandú' WHERE id =
      (SELECT participant_id FROM event_registrations WHERE id = ${s.reg3})`;
    expect(types(await read('?q=nandu'))).toEqual([
      'registration_void',
      'pass_removal',
      'pass_assignment',
      'manual_registration',
    ]);
    // Folio, with or without its hyphen.
    expect(s.folio).toMatch(/-/);
    expect(types(await read(`?q=${encodeURIComponent(s.folio!)}`))).toEqual(reg1Types);
    expect(types(await read(`?q=${s.folio!.replace(/-/g, '').toLowerCase()}`))).toEqual(reg1Types);
    // Receipt numbers, including the previous and new receipt of a cash correction.
    expect(types(await read('?q=R-1'))).toEqual(['cash_correction', 'cash_confirmation']);
    expect(types(await read('?q=r-2'))).toEqual(['cash_correction']);
    // A shown reason matches; the hidden cash confirmation note never does.
    expect(types(await read('?q=g%C3%B3lden'))).toEqual(['complimentary_confirmation']);
    expect(await read(`?q=${encodeURIComponent('Paid at door')}`)).toEqual({
      items: [],
      nextCursor: null,
      counts: { all: 0, corrections: 0, on_site: 0, complimentary: 0 },
    });
    // LIKE metacharacters are literal.
    expect((await read('?q=%25%25')).items).toEqual([]);
    // Combined with a filter and the cursor; counts ignore both.
    const corrections = await read(`?q=${encodeURIComponent(s.folio!)}&filter=corrections`);
    expect(types(corrections)).toEqual(reg1Types.slice(0, 4));
    const first = await read(`?q=${encodeURIComponent(s.folio!)}&limit=5`);
    const rest = await read(
      `?q=${encodeURIComponent(s.folio!)}&limit=5&cursor=${encodeURIComponent(first.nextCursor!)}`,
    );
    expect([...types(first), ...types(rest)]).toEqual(reg1Types);
    expect(rest.nextCursor).toBeNull();
    expect(rest.counts).toEqual(first.counts);
    expect(first.counts).toEqual({ all: 8, corrections: 4, on_site: 1, complimentary: 0 });
  });

  it('pages by cursor across equal timestamps without gaps or repeats (#104)', async () => {
    const f = await fixture();
    const admin = await session('admin', f.event);
    const reg = await registration(f.event, 1, true);
    const at = '2026-10-21T12:00:00.123456Z';
    const ids: string[] = [];
    for (let i = 0; i < 5; i++)
      ids.push(
        await fact(reg, f.event, { type: 'online_registration', kind: 'public', createdAt: at }),
      );
    const older = await fact(reg, f.event, {
      type: 'online_registration',
      kind: 'public',
      createdAt: '2026-10-21T12:00:00.123455Z',
    });
    const newer = await fact(reg, f.event, {
      type: 'registration_expiry',
      kind: 'system',
      createdAt: '2026-10-21T12:00:00.123457Z',
      before: { status: 'pending_payment' },
      after: { status: 'voided' },
    });
    const expected = [newer, ...[...ids].sort().reverse(), older];
    const seen: string[] = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      const query: string = `?limit=2${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`;
      const response = await history(f.event, query).set('Cookie', admin.cookie).expect(200);
      const page = response.body as Page;
      expect(page.items.length).toBeLessThanOrEqual(2);
      seen.push(...page.items.map((item) => item.id));
      cursor = page.nextCursor;
      pages++;
    } while (cursor && pages < 10);
    expect(seen).toEqual(expected);
    expect(pages).toBe(4);
    const defaults = await history(f.event).set('Cookie', admin.cookie).expect(200);
    expect((defaults.body as Page).items.map((item) => item.id)).toEqual(expected);
  });

  it('defaults to 50 items per page and returns a cursor only when more remain (#104)', async () => {
    const f = await fixture();
    const admin = await session('admin', f.event);
    const reg = await registration(f.event, 1, true);
    for (let i = 0; i < 51; i++)
      await fact(reg, f.event, {
        type: 'online_registration',
        kind: 'public',
        createdAt: new Date(Date.UTC(2026, 9, 1, 0, 0, i)).toISOString(),
      });
    const first = (await history(f.event).set('Cookie', admin.cookie).expect(200)).body as Page;
    expect(first.items).toHaveLength(50);
    expect(first.nextCursor).toEqual(expect.any(String));
    const rest = (
      await history(f.event, `?cursor=${encodeURIComponent(first.nextCursor!)}`)
        .set('Cookie', admin.cookie)
        .expect(200)
    ).body as Page;
    expect(rest.items).toHaveLength(1);
    expect(rest.nextCursor).toBeNull();
    const exact = (await history(f.event, '?limit=51').set('Cookie', admin.cookie).expect(200))
      .body as Page;
    expect(exact.items).toHaveLength(51);
    expect(exact.nextCursor).toBeNull();
  });

  it('reads only the requested event (#104)', async () => {
    const f = await fixture();
    const admin = await session('admin', f.event);
    const otherAdmin = await session('admin', f.other);
    const mine = await registration(f.event, 1, true);
    const theirs = await registration(f.other, 2, true);
    const mineId = await fact(mine, f.event, { type: 'online_registration', kind: 'public' });
    const theirsId = await fact(theirs, f.other, { type: 'online_registration', kind: 'public' });
    const own = (await history(f.event).set('Cookie', admin.cookie).expect(200)).body as Page;
    expect(own.items.map((item) => item.id)).toEqual([mineId]);
    const other = (await history(f.other).set('Cookie', otherAdmin.cookie).expect(200))
      .body as Page;
    expect(other.items.map((item) => item.id)).toEqual([theirsId]);
  });

  it('answers judges, other-event admins and anonymous callers with the same safe 401 (#104)', async () => {
    const f = await fixture();
    const judge = await session('judge', f.event);
    const otherAdmin = await session('admin', f.other);
    const anonymous = await history(f.event).expect(401);
    const asJudge = await history(f.event).set('Cookie', judge.cookie).expect(401);
    const asOtherAdmin = await history(f.event).set('Cookie', otherAdmin.cookie).expect(401);
    expect(asJudge.body).toEqual(anonymous.body);
    expect(asOtherAdmin.body).toEqual(anonymous.body);
    await history(f.event, '?limit=0').expect(401);
  });

  it('rejects malformed limits, cursors and filters with field errors (#104)', async () => {
    const f = await fixture();
    const admin = await session('admin', f.event);
    const invalid = (fieldErrors: Record<string, string>) => ({
      statusCode: 400,
      message: 'Invalid history query',
      fieldErrors,
    });
    const encode = (value: string) => encodeURIComponent(Buffer.from(value).toString('base64url'));
    for (const limit of ['0', '101', '-1', '1.5', 'abc', '', '01'])
      expect(
        (await history(f.event, `?limit=${limit}`).set('Cookie', admin.cookie).expect(400)).body,
      ).toEqual(invalid({ limit: 'invalid' }));
    for (const cursor of [
      'not-a-cursor',
      encode('2026-10-21T12:00:00.123456Z'),
      encode('2026-13-21T12:00:00.123456Z|00000000-0000-4000-8000-000000000000'),
      encode('2026-10-21T12:00:00Z|00000000-0000-4000-8000-000000000000'),
      encode('2026-10-21T12:00:00.123456Z|not-a-uuid'),
      '',
    ])
      expect(
        (await history(f.event, `?cursor=${cursor}`).set('Cookie', admin.cookie).expect(400)).body,
      ).toEqual(invalid({ cursor: 'invalid' }));
    expect(
      (await history(f.event, '?filter=voids').set('Cookie', admin.cookie).expect(400)).body,
    ).toEqual(invalid({ filter: 'invalid' }));
    expect(
      (
        await history(f.event, '?limit=1&limit=2&filter=all&filter=all')
          .set('Cookie', admin.cookie)
          .expect(400)
      ).body,
    ).toEqual(invalid({ limit: 'invalid', filter: 'invalid' }));
    for (const filter of ['on-site', 'ON_SITE', 'complimentaries'])
      expect(
        (await history(f.event, `?filter=${filter}`).set('Cookie', admin.cookie).expect(400)).body,
      ).toEqual(invalid({ filter: 'invalid' }));
    for (const q of ['a', '%20a%20', 'x'.repeat(201), 'ab&q=cd'])
      expect(
        (await history(f.event, `?q=${q}`).set('Cookie', admin.cookie).expect(400)).body,
      ).toEqual(invalid({ q: 'invalid' }));
    const valid = encode('2026-10-21T12:00:00.123456Z|00000000-0000-4000-8000-000000000000');
    const none = { all: 0, corrections: 0, on_site: 0, complimentary: 0 };
    await history(f.event, `?cursor=${valid}&limit=100&filter=corrections`)
      .set('Cookie', admin.cookie)
      .expect(200, { items: [], nextCursor: null, counts: none });
    await history(f.event, `?q=${'x'.repeat(200)}&filter=on_site`)
      .set('Cookie', admin.cookie)
      .expect(200, { items: [], nextCursor: null, counts: none });
  });
});
