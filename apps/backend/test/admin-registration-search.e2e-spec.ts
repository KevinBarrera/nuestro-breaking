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
import { type RegistrationSearchPage } from '@/events/registration-search/registration-search.types';
import { PostgresHarness } from './support/postgres-harness';

jest.setTimeout(120_000);

describe('GET /admin/events/:eventId/participants (e2e)', () => {
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

  async function fixture() {
    const [{ organizationId }] = await client<{ organizationId: string }[]>`
      INSERT INTO organizations (name) VALUES ('Organizer') RETURNING id AS "organizationId"
    `;
    const [event, other] = await client<{ id: string }[]>`
      INSERT INTO events (organization_id, name, time_zone)
      VALUES (${organizationId}, 'Visible event', 'Etc/UTC'),
        (${organizationId}, 'Private event', 'Etc/UTC') RETURNING id
    `;
    const [first, second, third] = await client<{ id: string }[]>`
      INSERT INTO participants (full_name, email, stage_name)
      VALUES ('Alex Rivera', 'alex@example.com', 'Flash'),
        ('Alex Rivera', 'second@example.com', 'Other'),
        ('Hidden Person', 'hidden@example.com', 'Secret') RETURNING id
    `;
    const [one, two, hidden] = await client<{ id: string }[]>`
      INSERT INTO event_registrations (event_id, participant_id, folio, status, confirmation_source, confirmed_at)
      VALUES (${event.id}, ${first.id}, 'F-10', 'confirmed', 'admin_cash', now()),
        (${event.id}, ${second.id}, NULL, 'pending_payment', NULL, NULL),
        (${other.id}, ${third.id}, 'F-12', 'confirmed', 'admin_cash', now())
      RETURNING id
    `;
    const [{ venueId }] = await client<{ venueId: string }[]>`
      INSERT INTO venues (organization_id, name) VALUES (${organizationId}, 'Hall')
      RETURNING id AS "venueId"
    `;
    await client`
      INSERT INTO event_venues (organization_id, event_id, venue_id)
      VALUES (${organizationId}, ${event.id}, ${venueId}), (${organizationId}, ${other.id}, ${venueId})
    `;
    // Access comes from passes, never from legacy enrollment rows: Full includes the workshop,
    // social and archived activities and makes the battle selectable (selected on `one`).
    const [battle, workshop, social, archived, privateActivity] = await client<{ id: string }[]>`
      INSERT INTO activities (event_id, venue_id, kind, name, starts_at, ends_at, status)
      VALUES (${event.id}, ${venueId}, 'competition', 'Battle', now(), now() + interval '1 hour', 'active'),
        (${event.id}, ${venueId}, 'workshop', 'Workshop', now(), now() + interval '1 hour', 'active'),
        (${event.id}, ${venueId}, 'social', 'Social', now(), now() + interval '1 hour', 'active'),
        (${event.id}, ${venueId}, 'workshop', 'Archived', now(), now() + interval '1 hour', 'archived'),
        (${other.id}, ${venueId}, 'competition', 'Private battle', now(), now() + interval '1 hour', 'active')
      RETURNING id
    `;
    const [full, general, privatePass] = await client<{ id: string }[]>`
      INSERT INTO event_pass_types (event_id, name, pass_class, price_cents)
      VALUES (${event.id}, 'Full', 'full', 1000), (${event.id}, 'General', 'general', 300),
        (${other.id}, 'Private full', 'full', 1000)
      RETURNING id
    `;
    await client`
      INSERT INTO event_pass_type_activities (event_id, pass_type_id, activity_id, access)
      VALUES (${event.id}, ${full.id}, ${workshop.id}, 'included'),
        (${event.id}, ${full.id}, ${social.id}, 'included'),
        (${event.id}, ${full.id}, ${archived.id}, 'included'),
        (${event.id}, ${full.id}, ${battle.id}, 'selectable'),
        (${other.id}, ${privatePass.id}, ${privateActivity.id}, 'included')
    `;
    const [held] = await client<{ id: string }[]>`
      INSERT INTO event_registration_passes (event_id, event_registration_id, pass_type_id, price_cents)
      VALUES (${event.id}, ${one.id}, ${full.id}, 1000), (${other.id}, ${hidden.id}, ${privatePass.id}, 1000)
      RETURNING id
    `;
    await client`
      INSERT INTO event_registration_pass_selections (event_id, registration_pass_id, activity_id)
      VALUES (${event.id}, ${held.id}, ${battle.id})
    `;
    return {
      event,
      other,
      first,
      second,
      third,
      one,
      two,
      hidden,
      battle,
      workshop,
      social,
      archived,
      privateActivity,
      general,
    };
  }

  // Check-in writes the legacy enrollment row that an activity fact references (#126).
  async function enroll(eventId: string, registrationId: string, activityId: string) {
    const [{ id }] = await client<{ id: string }[]>`
      INSERT INTO event_activity_registrations (event_id, event_registration_id, activity_id)
      VALUES (${eventId}, ${registrationId}, ${activityId}) RETURNING id
    `;
    return id;
  }

  async function session(role = 'admin', eventId: string | null = null) {
    const [{ userId }] = await client<{ userId: string }[]>`
      INSERT INTO users (email, display_name, active)
      VALUES ('operator@example.com', 'Operator', true) RETURNING id AS "userId"
    `;
    await client`
      INSERT INTO user_roles (user_id, role, scope_type, scope_id)
      VALUES (${userId}, ${role}, ${eventId ? 'event' : 'global'}, ${eventId})
    `;
    const token = randomBytes(32).toString('hex');
    const [{ sessionId }] = await client<{ sessionId: string }[]>`
      INSERT INTO auth_sessions (user_id, token_digest, expires_at)
      VALUES (${userId}, ${createHash('sha256').update(token).digest('hex')}, now() + interval '1 hour')
      RETURNING id AS "sessionId"
    `;
    return { cookie: `nb_admin_session=${token}`, userId, sessionId };
  }

  const search = (eventId: string, q: string) =>
    request(app.getHttpServer()).get(`/admin/events/${eventId}/participants`).query({ q });

  it('denies missing, inactive, wrong-role and wrong-event sessions without leaking records', async () => {
    const { event, other } = await fixture();
    const missing = await search(event.id, 'Alex').expect(401);
    const { cookie, userId } = await session('admin', event.id);
    expect((await search(other.id, 'Hidden').set('Cookie', cookie).expect(401)).body).toEqual(
      missing.body,
    );
    await client`UPDATE user_roles SET role = 'dancer' WHERE user_id = ${userId}`;
    expect((await search(event.id, 'Alex').set('Cookie', cookie).expect(401)).body).toEqual(
      missing.body,
    );
    await client`UPDATE user_roles SET role = 'admin' WHERE user_id = ${userId}`;
    await client`UPDATE auth_sessions SET revoked_at = now() WHERE user_id = ${userId}`;
    expect((await search(event.id, 'Alex').set('Cookie', cookie).expect(401)).body).toEqual(
      missing.body,
    );
    expect(JSON.stringify(missing.body)).not.toMatch(/Alex|Hidden|Private/);
  });

  it('searches stored identity and folio fields only in the authorized event, returning minimal summaries', async () => {
    const { event, other, first, second, one, two, battle, workshop } = await fixture();
    const { cookie } = await session();
    const get = (q: string, id = event.id) => search(id, q).set('Cookie', cookie).expect(200);
    const result = await get('alex');
    const page = result.body as { results: unknown[] };
    expect(page).toEqual({
      total: 2,
      limit: 20,
      offset: 0,
      results: [
        {
          participant: {
            id: first.id,
            fullName: 'Alex Rivera',
            email: 'alex@example.com',
            stageName: 'Flash',
          },
          registration: {
            id: one.id,
            eventId: event.id,
            folio: 'F-10',
            status: 'confirmed',
            checkedInAt: null,
            generalEntryOnly: false,
          },
          activities: [
            { id: battle.id, name: 'Battle', kind: 'competition', checkedInAt: null },
            { id: workshop.id, name: 'Workshop', kind: 'workshop', checkedInAt: null },
          ].sort((a, b) => a.id.localeCompare(b.id)),
        },
        {
          participant: {
            id: second.id,
            fullName: 'Alex Rivera',
            email: 'second@example.com',
            stageName: 'Other',
          },
          registration: {
            id: two.id,
            eventId: event.id,
            folio: null,
            status: 'pending_payment',
            checkedInAt: null,
            generalEntryOnly: false,
          },
          activities: [],
        },
      ],
    });
    for (const q of ['ALEX@EXAMPLE.COM', 'flash', 'f-10']) {
      expect((await get(q)).body as unknown).toEqual({
        ...page,
        total: 1,
        results: [page.results[0]],
      });
    }
    expect((await get('hidden')).body).toEqual({ total: 0, limit: 20, offset: 0, results: [] });
    // Folios are unique system-wide; the other event's folio is only found inside that event.
    expect((await get('F-12')).body).toEqual({ total: 0, limit: 20, offset: 0, results: [] });
    expect(((await get('F-12', other.id)).body as { results: unknown[] }).results).toHaveLength(1);
    expect(JSON.stringify(result.body)).not.toMatch(
      /Private|admin_cash|confirmedAt|paymentProvider|actorUserId|sessionId|audit/,
    );
  });

  it('finds a registration by the receipt number of its cash confirmation, only in that event', async () => {
    const { event, other, first, third, one, two, hidden } = await fixture();
    const { cookie, userId, sessionId } = await session();
    await client`
      INSERT INTO registration_operation_audit (operation_type, actor_kind, actor_user_id, session_id,
        event_id, registration_id, participant_id, amount_cents, receipt, before_state, after_state)
      VALUES ('cash_confirmation', 'admin', ${userId}, ${sessionId}, ${event.id}, ${one.id},
          ${first.id}, 100, 'RC-0042', '{}', '{}'),
        ('cash_confirmation', 'admin', ${userId}, ${sessionId}, ${other.id}, ${hidden.id},
          ${third.id}, 100, 'RC-0099', '{}', '{}')`;
    const get = (q: string, id = event.id) =>
      search(id, q).set('Cookie', cookie).expect(200) as unknown as Promise<{
        body: RegistrationSearchPage;
      }>;
    for (const q of ['RC-0042', 'rc-00', '0042']) {
      const page = (await get(q)).body;
      expect(page.total).toBe(1);
      expect(page.results.map((result) => result.registration.id)).toEqual([one.id]);
    }
    expect((await get('RC-0099')).body.total).toBe(0);
    expect((await get('RC-0099', other.id)).body.results.map((r) => r.registration.id)).toEqual([
      hidden.id,
    ]);
    // A receipt match never duplicates a row that also matches by name.
    expect((await get('alex')).body.results.map((r) => r.registration.id)).toEqual([
      one.id,
      two.id,
    ]);
  });

  it('lists check-in activities from pass entitlements and flags general-entry-only registrations', async () => {
    const { event, one, two, battle, workshop, general } = await fixture();
    const { cookie } = await session();
    // No legacy enrollment rows exist: the list comes from the included and selected activities,
    // without the social kind or the archived workshop.
    expect(await client`SELECT id FROM event_activity_registrations`).toHaveLength(0);
    await client`
      INSERT INTO event_registration_passes (event_id, event_registration_id, pass_type_id, price_cents)
      VALUES (${event.id}, ${two.id}, ${general.id}, 300)
    `;
    const page = (await search(event.id, 'Alex').set('Cookie', cookie).expect(200))
      .body as RegistrationSearchPage;
    expect(
      page.results.map(({ registration, activities }) => ({
        id: registration.id,
        generalEntryOnly: registration.generalEntryOnly,
        activities,
      })),
    ).toEqual([
      {
        id: one.id,
        generalEntryOnly: false,
        activities: [
          { id: battle.id, name: 'Battle', kind: 'competition', checkedInAt: null },
          { id: workshop.id, name: 'Workshop', kind: 'workshop', checkedInAt: null },
        ].sort((a, b) => a.id.localeCompare(b.id)),
      },
      { id: two.id, generalEntryOnly: true, activities: [] },
    ]);
  });

  it('keeps batched access and check-in times apart per registration on one page', async () => {
    const { event, one, battle, workshop } = await fixture();
    const { cookie, userId, sessionId } = await session();
    const [{ id: fullPass }] = await client<{ id: string }[]>`
      SELECT id FROM event_pass_types WHERE event_id = ${event.id} AND pass_class = 'full'
    `;
    const [third] = await client<{ id: string }[]>`
      WITH person AS (
        INSERT INTO participants (full_name, email) VALUES ('Alex Zed', 'zed@example.com') RETURNING id
      )
      INSERT INTO event_registrations (event_id, participant_id, folio, status, confirmation_source, confirmed_at)
      SELECT ${event.id}, id, 'F-11', 'confirmed', 'admin_cash', now() FROM person RETURNING id
    `;
    await client`
      INSERT INTO event_registration_passes (event_id, event_registration_id, pass_type_id, price_cents)
      VALUES (${event.id}, ${third.id}, ${fullPass}, 1000)
    `;
    const [admission] = await client<{ id: string }[]>`
      INSERT INTO event_check_ins (event_id, event_registration_id, actor_user_id, session_id)
      VALUES (${event.id}, ${one.id}, ${userId}, ${sessionId}) RETURNING id
    `;
    const [{ checkedInAt }] = await client<{ checkedInAt: string }[]>`
      INSERT INTO activity_check_ins
        (event_id, event_registration_id, activity_id, enrollment_id, event_check_in_id,
         actor_user_id, session_id)
      VALUES (${event.id}, ${one.id}, ${workshop.id}, ${await enroll(event.id, one.id, workshop.id)},
        ${admission.id}, ${userId}, ${sessionId})
      RETURNING checked_in_at AS "checkedInAt"
    `;
    const page = (await search(event.id, 'Alex').set('Cookie', cookie).expect(200))
      .body as RegistrationSearchPage;
    const byId = new Map(page.results.map((result) => [result.registration.id, result]));
    expect(byId.get(one.id)?.activities).toEqual(
      [
        { id: battle.id, name: 'Battle', kind: 'competition', checkedInAt: null },
        {
          id: workshop.id,
          name: 'Workshop',
          kind: 'workshop',
          checkedInAt: new Date(checkedInAt).toISOString(),
        },
      ].sort((a, b) => a.id.localeCompare(b.id)),
    );
    // The same pass type without a selection: only the included workshop, not yet checked in.
    expect(byId.get(third.id)?.activities).toEqual([
      { id: workshop.id, name: 'Workshop', kind: 'workshop', checkedInAt: null },
    ]);
    expect(byId.get(third.id)?.registration.generalEntryOnly).toBe(false);
  });

  it('projects only scoped durable attendance timestamps for the requested page and pass access', async () => {
    const { event, other, one, two, hidden, battle, workshop, privateActivity } = await fixture();
    const { cookie, userId, sessionId } = await session();
    const eventTime = '2026-01-02T03:04:05.000Z';
    const activityTime = '2026-01-02T03:05:06.000Z';
    const privateTime = '2026-01-03T03:04:05.000Z';
    await client`
      UPDATE event_registrations
      SET status = 'confirmed', confirmation_source = 'admin_cash', confirmed_at = now()
      WHERE id = ${hidden.id}
    `;
    const [admission] = await client<{ id: string; checkedInAt: string }[]>`
      INSERT INTO event_check_ins (event_id, event_registration_id, actor_user_id, session_id, checked_in_at)
      VALUES (${event.id}, ${one.id}, ${userId}, ${sessionId}, ${eventTime})
      RETURNING id, checked_in_at AS "checkedInAt"
    `;
    const [privateAdmission] = await client<{ id: string; checkedInAt: string }[]>`
      INSERT INTO event_check_ins (event_id, event_registration_id, actor_user_id, session_id, checked_in_at)
      VALUES (${other.id}, ${hidden.id}, ${userId}, ${sessionId}, ${privateTime})
      RETURNING id, checked_in_at AS "checkedInAt"
    `;
    const enrollmentId = await enroll(event.id, one.id, battle.id);
    const privateEnrollmentId = await enroll(other.id, hidden.id, privateActivity.id);
    const [activityAdmission] = await client<{ id: string; checkedInAt: string }[]>`
      INSERT INTO activity_check_ins
        (event_id, event_registration_id, activity_id, enrollment_id, event_check_in_id,
         actor_user_id, session_id, checked_in_at)
      VALUES (${event.id}, ${one.id}, ${battle.id}, ${enrollmentId}, ${admission.id},
        ${userId}, ${sessionId}, ${activityTime})
      RETURNING id, checked_in_at AS "checkedInAt"
    `;
    const [privateActivityAdmission] = await client<{ checkedInAt: string }[]>`
      INSERT INTO activity_check_ins
        (event_id, event_registration_id, activity_id, enrollment_id, event_check_in_id,
         actor_user_id, session_id, checked_in_at)
      VALUES (${other.id}, ${hidden.id}, ${privateActivity.id}, ${privateEnrollmentId},
        ${privateAdmission.id}, ${userId}, ${sessionId}, ${privateTime})
      RETURNING checked_in_at AS "checkedInAt"
    `;

    const firstPage = (
      await search(event.id, 'Alex').query({ limit: 1 }).set('Cookie', cookie).expect(200)
    ).body as RegistrationSearchPage;
    expect(firstPage).toMatchObject({ total: 2, limit: 1, offset: 0 });
    expect(firstPage.results[0].registration).toEqual({
      id: one.id,
      eventId: event.id,
      folio: 'F-10',
      status: 'confirmed',
      checkedInAt: new Date(admission.checkedInAt).toISOString(),
      generalEntryOnly: false,
    });
    expect(firstPage.results[0].activities).toEqual(
      [
        {
          id: battle.id,
          name: 'Battle',
          kind: 'competition',
          checkedInAt: new Date(activityAdmission.checkedInAt).toISOString(),
        },
        { id: workshop.id, name: 'Workshop', kind: 'workshop', checkedInAt: null },
      ].sort((a, b) => a.id.localeCompare(b.id)),
    );
    const nextPage = (
      await search(event.id, 'Alex')
        .query({ limit: 1, offset: 1 })
        .set('Cookie', cookie)
        .expect(200)
    ).body as RegistrationSearchPage;
    expect(nextPage).toMatchObject({
      total: 2,
      limit: 1,
      offset: 1,
      results: [{ registration: { id: two.id, checkedInAt: null }, activities: [] }],
    });
    const visible = JSON.stringify([firstPage, nextPage]);
    for (const secret of [
      userId,
      sessionId,
      admission.id,
      activityAdmission.id,
      enrollmentId,
      privateEnrollmentId,
      'Private',
      'admin_cash',
    ]) {
      expect(visible).not.toContain(secret);
    }
    const hiddenHere = (await search(event.id, 'Hidden').set('Cookie', cookie).expect(200))
      .body as RegistrationSearchPage;
    expect(hiddenHere.results).toEqual([]);
    const privatePage = (await search(other.id, 'Hidden').set('Cookie', cookie).expect(200))
      .body as RegistrationSearchPage;
    expect(privatePage.results).toMatchObject([
      {
        registration: {
          id: hidden.id,
          checkedInAt: new Date(privateAdmission.checkedInAt).toISOString(),
        },
        activities: [
          {
            id: privateActivity.id,
            checkedInAt: new Date(privateActivityAdmission.checkedInAt).toISOString(),
          },
        ],
      },
    ]);
    await client`
      UPDATE user_roles SET scope_type = 'event', scope_id = ${event.id}
      WHERE user_id = ${userId}
    `;
    expect((await search(other.id, 'Hidden').set('Cookie', cookie).expect(401)).body).toEqual(
      (await search(other.id, 'Hidden').expect(401)).body,
    );
  });

  it('bounds pages, validates parameters, and never treats blank or wildcard input as a roster search', async () => {
    const { event } = await fixture();
    const { cookie } = await session();
    const get = (params: { q?: string; limit?: string; offset?: string }) =>
      request(app.getHttpServer())
        .get(`/admin/events/${event.id}/participants`)
        .query(params)
        .set('Cookie', cookie);
    expect((await get({ q: 'Alex', limit: '1', offset: '1' }).expect(200)).body).toMatchObject({
      total: 2,
      limit: 1,
      offset: 1,
      results: [{ participant: { email: 'second@example.com' } }],
    });
    for (const q of ['nobody', '%%', '__']) {
      expect((await get({ q }).expect(200)).body).toEqual({
        total: 0,
        limit: 20,
        offset: 0,
        results: [],
      });
    }
    for (const params of [
      {},
      { q: ' ' },
      { q: 'a' },
      { q: '%' },
      { q: 'Alex', limit: '51' },
      { q: 'Alex', limit: '0' },
      { q: 'Alex', offset: '-1' },
      { q: 'Alex', limit: 'oops' },
    ]) {
      const response = await get(params).expect(400);
      expect(JSON.stringify(response.body)).not.toMatch(/alex@example.com|Hidden Person/);
    }
  });
});
