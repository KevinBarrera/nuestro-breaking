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

type AttendeeLists = {
  event: { id: string; name: string };
  generatedAt: string;
  passTypes: { id: string; name: string; passClass: string; status: string }[];
  activities: { id: string; name: string; kind: string; startsAt: string }[];
  registrations: {
    registrationId: string;
    folio: string | null;
    fullName: string;
    stageName: string | null;
    status: string;
    eventCheckedInAt: string | null;
    passTypeIds: string[];
    activities: { activityId: string; checkedInAt: string | null }[];
  }[];
};

// Contact data on the fixture participants; none of it may reach the response.
const CONTACT = {
  email: 'carla.ruiz@example.com',
  phone: '+52 55 1234 5678',
  instagram: 'carla.breaks',
  birthDate: '1999-04-12',
};

describe('admin attendee lists (e2e)', () => {
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

  // Catalog, inserted out of display order: an Open Styles add-on including its battle, a general
  // pass without activities, a full pass with selectable battles plus included workshop, social and
  // archived activities, an archived full pass including the workshop, a pass held only by a voided
  // registration and a pass nobody holds. Another event has its own pass, activity and attendee.
  async function fixture() {
    const [{ id: org }] = await client<
      { id: string }[]
    >`INSERT INTO organizations (name) VALUES ('Org') RETURNING id`;
    const [event, other] = await client<{ id: string }[]>`
      INSERT INTO events (organization_id, name, time_zone)
      VALUES (${org}, 'Los más pesados 2026', 'Etc/UTC'), (${org}, 'Otro evento', 'Etc/UTC')
      RETURNING id`;
    const [{ id: venue }] = await client<{ id: string }[]>`
      INSERT INTO venues (organization_id, name) VALUES (${org}, 'Hall') RETURNING id`;
    await client`INSERT INTO event_venues (organization_id, event_id, venue_id)
      VALUES (${org}, ${event.id}, ${venue}), (${org}, ${other.id}, ${venue})`;
    const [openBattle, breaking, afro, toprock, social, retired, krump, popping, foreignActivity] =
      await client<{ id: string }[]>`
      INSERT INTO activities (event_id, venue_id, kind, name, starts_at, ends_at, status)
      VALUES (${event.id}, ${venue}, 'competition', 'Open Styles', '2026-11-20T21:00:00Z', '2026-11-20T22:00:00Z', 'active'),
        (${event.id}, ${venue}, 'competition', 'Breaking 1v1', '2026-11-20T18:00:00Z', '2026-11-20T20:00:00Z', 'active'),
        (${event.id}, ${venue}, 'competition', 'Afro 1v1', '2026-11-20T18:00:00Z', '2026-11-20T20:00:00Z', 'active'),
        (${event.id}, ${venue}, 'workshop', 'Toprock', '2026-11-20T10:00:00Z', '2026-11-20T12:00:00Z', 'active'),
        (${event.id}, ${venue}, 'social', 'Cypher night', '2026-11-20T08:00:00Z', '2026-11-20T09:00:00Z', 'active'),
        (${event.id}, ${venue}, 'workshop', 'Retired', '2026-11-20T07:00:00Z', '2026-11-20T08:00:00Z', 'archived'),
        (${event.id}, ${venue}, 'competition', 'Krump 1v1', '2026-11-20T09:00:00Z', '2026-11-20T10:00:00Z', 'active'),
        (${event.id}, ${venue}, 'competition', 'Popping 1v1', '2026-11-20T09:00:00Z', '2026-11-20T10:00:00Z', 'active'),
        (${other.id}, ${venue}, 'workshop', 'Foreign workshop', '2026-11-20T06:00:00Z', '2026-11-20T07:00:00Z', 'active')
      RETURNING id`;
    const [openStyles, general, fullBreaking, oldPass, voidedOnly, unheld, foreignPass] =
      await client<{ id: string }[]>`
      INSERT INTO event_pass_types (event_id, name, pass_class, price_cents, requires_pass_class, status)
      VALUES (${event.id}, 'Open Styles', 'add_on', 15000, 'full', 'active'),
        (${event.id}, 'General', 'general', 30000, NULL, 'active'),
        (${event.id}, 'Full breaking', 'full', 120000, NULL, 'active'),
        (${event.id}, 'Antiguo pase', 'full', 90000, NULL, 'archived'),
        (${event.id}, 'Solo anulado', 'full', 90000, NULL, 'active'),
        (${event.id}, 'Nadie', 'full', 90000, NULL, 'active'),
        (${other.id}, 'Foreign pass', 'full', 1000, NULL, 'active')
      RETURNING id`;
    await client`INSERT INTO event_pass_type_activities (event_id, pass_type_id, activity_id, access)
      VALUES (${event.id}, ${openStyles.id}, ${openBattle.id}, 'included'),
        (${event.id}, ${fullBreaking.id}, ${breaking.id}, 'selectable'),
        (${event.id}, ${fullBreaking.id}, ${afro.id}, 'selectable'),
        (${event.id}, ${fullBreaking.id}, ${krump.id}, 'selectable'),
        (${event.id}, ${fullBreaking.id}, ${toprock.id}, 'included'),
        (${event.id}, ${fullBreaking.id}, ${social.id}, 'included'),
        (${event.id}, ${fullBreaking.id}, ${retired.id}, 'included'),
        (${event.id}, ${oldPass.id}, ${toprock.id}, 'included'),
        (${event.id}, ${voidedOnly.id}, ${popping.id}, 'included'),
        (${event.id}, ${unheld.id}, ${popping.id}, 'included'),
        (${other.id}, ${foreignPass.id}, ${foreignActivity.id}, 'included')`;
    return {
      event: event.id,
      other: other.id,
      openBattle: openBattle.id,
      breaking: breaking.id,
      afro: afro.id,
      toprock: toprock.id,
      openStyles: openStyles.id,
      general: general.id,
      fullBreaking: fullBreaking.id,
      oldPass: oldPass.id,
      voidedOnly: voidedOnly.id,
      foreignPass: foreignPass.id,
      foreignActivity: foreignActivity.id,
    };
  }
  async function registration(
    eventId: string,
    person: {
      fullName: string;
      status: 'pending_payment' | 'confirmed' | 'voided';
      folio?: string;
      stageName?: string;
      contact?: typeof CONTACT;
    },
  ) {
    const contact = person.contact;
    const [{ id: participantId }] = await client<{ id: string }[]>`
      INSERT INTO participants (full_name, stage_name, email, phone, instagram, birth_date)
      VALUES (${person.fullName}, ${person.stageName ?? null}, ${contact?.email ?? null},
        ${contact?.phone ?? null}, ${contact?.instagram ?? null}, ${contact?.birthDate ?? null})
      RETURNING id`;
    const confirmed = person.status === 'confirmed';
    const [{ id }] = await client<{ id: string }[]>`
      INSERT INTO event_registrations (event_id, participant_id, status, confirmation_source,
          confirmed_at, folio)
      VALUES (${eventId}, ${participantId}, ${person.status}, ${confirmed ? 'admin_cash' : null},
        ${confirmed ? new Date().toISOString() : null}, ${person.folio ?? null})
      RETURNING id`;
    return id;
  }
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
  }
  async function session(role: string, eventId: string | null) {
    const [{ id: userId }] = await client<
      { id: string }[]
    >`INSERT INTO users (email, display_name, active) VALUES (${randomBytes(8).toString('hex') + '@example.com'}, 'Operator', true) RETURNING id`;
    await client`INSERT INTO user_roles (user_id, role, scope_type, scope_id)
      VALUES (${userId}, ${role}, ${eventId ? 'event' : 'global'}, ${eventId})`;
    const token = randomBytes(32).toString('hex');
    await client`INSERT INTO auth_sessions (user_id, token_digest, expires_at)
      VALUES (${userId}, ${createHash('sha256').update(token).digest('hex')}, now() + interval '1 hour')`;
    return `nb_admin_session=${token}`;
  }
  const origin = readTrustedOrigin(process.env);
  const headers = (cookie: string) => ({
    Cookie: cookie,
    Origin: origin,
    'X-CSRF-Token': createHash('sha256')
      .update(`nb-admin-csrf-v1:${cookie.slice('nb_admin_session='.length)}`)
      .digest('hex'),
  });
  const server = () => request(app.getHttpServer());
  const read = (event: string) => server().get(`/admin/events/${event}/attendee-lists`);
  const at = (value: Date | string | undefined) =>
    value === undefined ? undefined : new Date(value).toISOString();

  // Carla holds the full pass with two selected battles plus the add-on; Beto an archived full
  // pass; Ana is pending with general entry; a second Ana holds nothing; Dani is voided.
  async function attendees() {
    const f = await fixture();
    const carla = await registration(f.event, {
      fullName: 'Carla Ruiz',
      status: 'confirmed',
      folio: 'LMP-0002',
      stageName: 'La Carla',
      contact: CONTACT,
    });
    const beto = await registration(f.event, {
      fullName: 'beto Gómez',
      status: 'confirmed',
      folio: 'LMP-0001',
    });
    const ana = await registration(f.event, { fullName: 'Ana Pérez', status: 'pending_payment' });
    const anaTwin = await registration(f.event, {
      fullName: 'Ana Pérez',
      status: 'confirmed',
      folio: 'LMP-0003',
    });
    const dani = await registration(f.event, { fullName: 'Dani Anulada', status: 'voided' });
    const foreign = await registration(f.other, { fullName: 'Foráneo', status: 'confirmed' });
    await holdPass(f.event, carla, f.fullBreaking, [f.breaking, f.afro]);
    await holdPass(f.event, carla, f.openStyles);
    await holdPass(f.event, beto, f.oldPass);
    await holdPass(f.event, ana, f.general);
    await holdPass(f.event, dani, f.voidedOnly);
    await holdPass(f.other, foreign, f.foreignPass);
    return { ...f, carla, beto, ana, anaTwin, dani, foreign };
  }

  it('returns a contact-free snapshot of passes, check-in activities and listed attendees', async () => {
    const f = await attendees();
    const cookie = await session('admin', f.event);
    await server()
      .post(`/admin/events/${f.event}/registrations/${f.beto}/check-in`)
      .set(headers(cookie))
      .send({})
      .expect(201);
    await server()
      .post(`/admin/events/${f.event}/registrations/${f.carla}/activities/${f.breaking}/check-in`)
      .set(headers(cookie))
      .send({})
      .expect(201);
    const eventCheckIns = await client<{ registration: string; checked_in_at: Date }[]>`
      SELECT event_registration_id AS registration, checked_in_at FROM event_check_ins`;
    const eventCheckIn = (id: string) =>
      at(eventCheckIns.find((row) => row.registration === id)?.checked_in_at);
    const [carlaBreaking] = await client<{ checked_in_at: Date }[]>`
      SELECT checked_in_at FROM activity_check_ins
      WHERE event_registration_id = ${f.carla} AND activity_id = ${f.breaking}`;
    const before = Date.now();

    const response = await read(f.event).set('Cookie', cookie).expect(200);

    const body = response.body as AttendeeLists;
    expect(Math.abs(new Date(body.generatedAt).getTime() - before)).toBeLessThan(60_000);
    const [firstAna, secondAna] = [f.ana, f.anaTwin].sort();
    const ana = (id: string) =>
      id === f.ana
        ? {
            registrationId: f.ana,
            folio: null,
            fullName: 'Ana Pérez',
            stageName: null,
            status: 'pending_payment',
            eventCheckedInAt: null,
            passTypeIds: [f.general],
            activities: [],
          }
        : {
            registrationId: f.anaTwin,
            folio: 'LMP-0003',
            fullName: 'Ana Pérez',
            stageName: null,
            status: 'confirmed',
            eventCheckedInAt: null,
            passTypeIds: [],
            activities: [],
          };
    expect(body).toEqual({
      event: { id: f.event, name: 'Los más pesados 2026' },
      generatedAt: expect.any(String) as string,
      passTypes: [
        { id: f.oldPass, name: 'Antiguo pase', passClass: 'full', status: 'archived' },
        { id: f.fullBreaking, name: 'Full breaking', passClass: 'full', status: 'active' },
        { id: f.general, name: 'General', passClass: 'general', status: 'active' },
        { id: f.openStyles, name: 'Open Styles', passClass: 'add_on', status: 'active' },
      ],
      activities: [
        {
          id: f.toprock,
          name: 'Toprock',
          kind: 'workshop',
          startsAt: '2026-11-20T10:00:00.000Z',
        },
        {
          id: f.afro,
          name: 'Afro 1v1',
          kind: 'competition',
          startsAt: '2026-11-20T18:00:00.000Z',
        },
        {
          id: f.breaking,
          name: 'Breaking 1v1',
          kind: 'competition',
          startsAt: '2026-11-20T18:00:00.000Z',
        },
        {
          id: f.openBattle,
          name: 'Open Styles',
          kind: 'competition',
          startsAt: '2026-11-20T21:00:00.000Z',
        },
      ],
      registrations: [
        ana(firstAna),
        ana(secondAna),
        {
          registrationId: f.beto,
          folio: 'LMP-0001',
          fullName: 'beto Gómez',
          stageName: null,
          status: 'confirmed',
          eventCheckedInAt: eventCheckIn(f.beto),
          passTypeIds: [f.oldPass],
          activities: [{ activityId: f.toprock, checkedInAt: null }],
        },
        {
          registrationId: f.carla,
          folio: 'LMP-0002',
          fullName: 'Carla Ruiz',
          stageName: 'La Carla',
          status: 'confirmed',
          eventCheckedInAt: eventCheckIn(f.carla),
          passTypeIds: [f.fullBreaking, f.openStyles],
          activities: [
            { activityId: f.toprock, checkedInAt: null },
            { activityId: f.afro, checkedInAt: null },
            { activityId: f.breaking, checkedInAt: at(carlaBreaking.checked_in_at) },
            { activityId: f.openBattle, checkedInAt: null },
          ],
        },
      ],
    });
    expect(eventCheckIn(f.beto)).toEqual(expect.any(String));
    expect(eventCheckIn(f.carla)).toEqual(expect.any(String));
    const serialized = JSON.stringify(body);
    for (const value of Object.values(CONTACT)) expect(serialized).not.toContain(value);
    expect(serialized).not.toMatch(/Dani Anulada|Solo anulado|Foráneo|Foreign|Cypher|Retired/);
  });

  it('lets a global administrator read any event and answers 404 for an unknown one', async () => {
    const f = await attendees();
    const cookie = await session('admin', null);

    const response = await read(f.event).set('Cookie', cookie).expect(200);

    expect((response.body as AttendeeLists).registrations).toHaveLength(4);
    await read(randomUUID()).set('Cookie', cookie).expect(404);
    await read('not-a-uuid').set('Cookie', cookie).expect(400);
  });

  it('answers judges, other-event admins and anonymous callers with the same safe 401', async () => {
    const f = await attendees();
    const judge = await session('judge', f.event);
    const otherAdmin = await session('admin', f.other);

    const anonymous = await read(f.event).expect(401);
    const asJudge = await read(f.event).set('Cookie', judge).expect(401);
    const asOtherAdmin = await read(f.event).set('Cookie', otherAdmin).expect(401);

    expect(asJudge.body).toEqual(anonymous.body);
    expect(asOtherAdmin.body).toEqual(anonymous.body);
    expect(JSON.stringify([anonymous.body, asJudge.body, asOtherAdmin.body])).not.toMatch(
      /Carla|Ana|beto|Los más pesados|Toprock/,
    );
  });
});
