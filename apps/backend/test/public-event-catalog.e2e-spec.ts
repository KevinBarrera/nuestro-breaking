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
import {
  PublicCatalogService,
  SalesClosedException,
  type PublicEventCatalog,
} from '@/events/public-catalog';
import { PostgresHarness } from './support/postgres-harness';

jest.setTimeout(120_000);

const DAY = 24 * 60 * 60 * 1000;
const fromNow = (ms: number) => new Date(Date.now() + ms).toISOString();
const SLUG = 'los-mas-pesados-nov-2026';
// Keys that must never reach a public response (D5): internal state, tenancy and audit fields.
const FORBIDDEN =
  /"(version|status|organizationId|eventId|createdAt|updatedAt|salesEnabled|access)"/;

describe('public event catalog (e2e)', () => {
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
    const [{ id: org }] = await client<
      { id: string }[]
    >`INSERT INTO organizations (name) VALUES ('Org') RETURNING id`;
    const [event, other] = await client<{ id: string }[]>`
      INSERT INTO events (organization_id, name, time_zone, slug, starts_at, ends_at, sales_enabled)
      VALUES (${org}, 'Los más pesados', 'America/Bogota', ${SLUG},
          '2026-11-20T14:00:00Z', '2026-11-22T04:00:00Z', true),
        (${org}, 'Other', 'Etc/UTC', 'other-event', NULL, NULL, true)
      RETURNING id`;
    const [{ id: venue }] = await client<{ id: string }[]>`
      INSERT INTO venues (organization_id, name) VALUES (${org}, 'Hall') RETURNING id`;
    await client`INSERT INTO event_venues (organization_id, event_id, venue_id)
      VALUES (${org}, ${event.id}, ${venue}), (${org}, ${other.id}, ${venue})`;
    const [toprock, footwork, retired, openStyles, foreign] = await client<{ id: string }[]>`
      INSERT INTO activities (event_id, venue_id, kind, name, starts_at, ends_at, status)
      VALUES (${event.id}, ${venue}, 'competition', 'Toprock', '2026-11-20T18:00:00Z', '2026-11-20T20:00:00Z', 'active'),
        (${event.id}, ${venue}, 'competition', 'Footwork', '2026-11-20T15:00:00Z', '2026-11-20T17:00:00Z', 'active'),
        (${event.id}, ${venue}, 'competition', 'Retired', '2026-11-20T14:00:00Z', '2026-11-20T15:00:00Z', 'active'),
        (${event.id}, ${venue}, 'competition', 'Open Styles 1vs1', '2026-11-21T18:00:00Z', '2026-11-21T20:00:00Z', 'active'),
        (${other.id}, ${venue}, 'competition', 'Foreign', '2026-11-20T10:00:00Z', '2026-11-20T12:00:00Z', 'active')
      RETURNING id`;
    const [full, general, addOn, archived, foreignPass] = await client<{ id: string }[]>`
      INSERT INTO event_pass_types (event_id, name, pass_class, price_cents, requires_pass_class, status)
      VALUES (${event.id}, 'Pase completo Breaking', 'full', 200000, NULL, 'active'),
        (${event.id}, 'Entrada general', 'general', 100000, NULL, 'active'),
        (${event.id}, 'Open Styles', 'add_on', 80000, 'full', 'active'),
        (${event.id}, 'Pase viejo', 'full', 150000, NULL, 'archived'),
        (${other.id}, 'Foreign pass', 'full', 1000, NULL, 'active')
      RETURNING id`;
    await client`INSERT INTO event_pass_type_activities (event_id, pass_type_id, activity_id, access)
      VALUES (${event.id}, ${full.id}, ${toprock.id}, 'selectable'),
        (${event.id}, ${full.id}, ${footwork.id}, 'selectable'),
        (${event.id}, ${full.id}, ${retired.id}, 'selectable'),
        (${event.id}, ${addOn.id}, ${openStyles.id}, 'included'),
        (${event.id}, ${archived.id}, ${toprock.id}, 'selectable'),
        (${other.id}, ${foreignPass.id}, ${foreign.id}, 'selectable')`;
    // Archive after linking, as an admin would; the link row stays but must not be public.
    await client`UPDATE activities SET status = 'archived', version = version + 1 WHERE id = ${retired.id}`;
    return {
      event: event.id,
      toprock: toprock.id,
      footwork: footwork.id,
      openStyles: openStyles.id,
      full: full.id,
      general: general.id,
      addOn: addOn.id,
    };
  }
  const catalog = (slug: string) =>
    request(app.getHttpServer()).get(`/public/events/${slug}/catalog`);
  const setSales = (enabled: boolean, opensAt: string | null, closesAt: string | null) =>
    client`UPDATE events SET sales_enabled = ${enabled}, sales_opens_at = ${opensAt},
      sales_closes_at = ${closesAt} WHERE slug = ${SLUG}`;

  it('lists active passes and active activities without a session while sales are open', async () => {
    const ids = await fixture();
    const opensAt = fromNow(-DAY);
    await setSales(true, opensAt, null);

    const response = await catalog(SLUG).expect(200);

    expect(response.headers['set-cookie']).toBeUndefined();
    expect(response.body).toEqual({
      event: {
        slug: SLUG,
        name: 'Los más pesados',
        timeZone: 'America/Bogota',
        startsAt: '2026-11-20T14:00:00.000Z',
        endsAt: '2026-11-22T04:00:00.000Z',
      },
      sales: { state: 'open', reason: null, opensAt, closesAt: null },
      passes: [
        {
          id: ids.full,
          name: 'Pase completo Breaking',
          passClass: 'full',
          priceCents: 200000,
          requiresPassClass: null,
          selectableActivities: [
            {
              id: ids.footwork,
              name: 'Footwork',
              kind: 'competition',
              startsAt: '2026-11-20T15:00:00.000Z',
              endsAt: '2026-11-20T17:00:00.000Z',
            },
            {
              id: ids.toprock,
              name: 'Toprock',
              kind: 'competition',
              startsAt: '2026-11-20T18:00:00.000Z',
              endsAt: '2026-11-20T20:00:00.000Z',
            },
          ],
          includedActivities: [],
        },
        {
          id: ids.general,
          name: 'Entrada general',
          passClass: 'general',
          priceCents: 100000,
          requiresPassClass: null,
          selectableActivities: [],
          includedActivities: [],
        },
        {
          id: ids.addOn,
          name: 'Open Styles',
          passClass: 'add_on',
          priceCents: 80000,
          requiresPassClass: 'full',
          selectableActivities: [],
          includedActivities: [
            {
              id: ids.openStyles,
              name: 'Open Styles 1vs1',
              kind: 'competition',
              startsAt: '2026-11-21T18:00:00.000Z',
              endsAt: '2026-11-21T20:00:00.000Z',
            },
          ],
        },
      ],
    });
    expect(JSON.stringify(response.body)).not.toMatch(FORBIDDEN);
    expect(JSON.stringify(response.body)).not.toMatch(/Pase viejo|Retired|Foreign/);
  });

  it.each([
    ['the switch is off', false, null, null, 'disabled'],
    ['the window has not opened', true, DAY, null, 'not_yet_open'],
    ['the window has ended', true, null, -DAY, 'ended'],
  ])(
    'reports closed sales and lists no passes when %s',
    async (_case, enabled, opens, closes, reason) => {
      await fixture();
      const opensAt = opens === null ? null : fromNow(opens);
      const closesAt = closes === null ? null : fromNow(closes);
      await setSales(enabled, opensAt, closesAt);

      const body = (await catalog(SLUG).expect(200)).body as PublicEventCatalog;

      expect(body.sales).toEqual({ state: 'closed', reason, opensAt, closesAt });
      expect(body.passes).toEqual([]);
      expect(body.event.slug).toBe(SLUG);
      expect(JSON.stringify(body)).not.toMatch(FORBIDDEN);
    },
  );

  it('returns a neutral 404 for an unknown or malformed slug', async () => {
    await fixture();
    for (const slug of ['missing-event', 'Los-Mas-Pesados', 'a'.repeat(81), 'bad_slug', '%20']) {
      const response = await catalog(slug).expect(404);
      expect((response.body as { message: string }).message).toBe('Event not found');
    }
  });

  it('requires open sales through the reusable check', async () => {
    const { event } = await fixture();
    const sales = app.get(PublicCatalogService);

    await expect(sales.requireOpen(SLUG, new Date())).resolves.toEqual({
      eventId: event,
      slug: SLUG,
    });
    await setSales(true, null, fromNow(-DAY));
    await expect(sales.requireOpen(SLUG, new Date())).rejects.toBeInstanceOf(SalesClosedException);
    await expect(sales.requireOpen(SLUG, new Date())).rejects.toMatchObject({
      response: { message: 'Sales are closed', reason: 'ended' },
    });
    await expect(sales.requireOpen('missing-event', new Date())).rejects.toMatchObject({
      status: 404,
    });
  });
});
