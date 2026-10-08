import { drizzle } from 'drizzle-orm/postgres-js';
import { type Sql } from 'postgres';
import * as schema from '@/database/schema';
import {
  parseNovemberCatalogSeedInput,
  seedNovemberCatalog,
  type SeedDatabase,
} from '@/events/catalog-seed';
import { PostgresHarness } from './support/postgres-harness';

jest.setTimeout(120_000);

type PassRow = {
  name: string;
  pass_class: string;
  price_cents: number;
  requires_pass_class: string | null;
  access: { activity: string; access: string }[];
};

const breaking = [
  'Breaking 1v1 Toprock',
  'Breaking Footwork',
  'Breaking Bboy',
  'Breaking Bgirl',
  'Breaking Kids',
  'Breaking Cypher queen/king',
  'Breaking 3v3',
];
const popping = ['Popping 1v1', 'Popping 2v2', 'Popping 1v1 beginner', 'Popping Cypher queen/king'];
const locking = ['Locking 1v1', 'Locking 3v3'];
const dancehall = ['Dancehall batallas mixtas'];
const openStyles = ['Open Styles 1vs1'];
const selectable = (names: string[]) =>
  names.map((activity) => ({ activity, access: 'selectable' })).sort(byActivity);
function byActivity(left: { activity: string }, right: { activity: string }): number {
  return left.activity.localeCompare(right.activity);
}

const localEnv = {
  LOCAL_CATALOG_SEED: 'I_UNDERSTAND_THIS_IS_LOCAL_ONLY',
  DATABASE_URL: 'postgresql://user:secret@localhost:5432/nuestro_local',
};
const localArgs = ['--confirm-local-only=seed-november-catalog'];

describe('November catalog seed guard', () => {
  it('accepts an explicit local configuration', () => {
    expect(() =>
      parseNovemberCatalogSeedInput(localArgs, localEnv, localEnv.DATABASE_URL),
    ).not.toThrow();
  });

  it.each([
    ['missing opt-in', { ...localEnv, LOCAL_CATALOG_SEED: undefined }, localArgs],
    ['missing confirmation', localEnv, []],
    ['wrong confirmation', localEnv, ['--confirm-local-only=yes']],
    ['unknown flag', localEnv, [...localArgs, '--force']],
    ['production NODE_ENV', { ...localEnv, NODE_ENV: 'production' }, localArgs],
    ['staging APP_ENV', { ...localEnv, APP_ENV: 'staging' }, localArgs],
    ['hosted marker', { ...localEnv, VERCEL: '1' }, localArgs],
    ['CI', { ...localEnv, CI: 'true' }, localArgs],
    [
      'remote host',
      { ...localEnv, DATABASE_URL: 'postgres://u:p@db.example.test/app_local' },
      localArgs,
    ],
    [
      'non-local database',
      { ...localEnv, DATABASE_URL: 'postgres://u:p@localhost/production' },
      localArgs,
    ],
    [
      'query overrides',
      { ...localEnv, DATABASE_URL: 'postgres://u:p@localhost/app_local?host=remote' },
      localArgs,
    ],
  ])('refuses %s without leaking secrets', (_case, env, args) => {
    let message = '';
    try {
      parseNovemberCatalogSeedInput(args, env, env.DATABASE_URL);
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).not.toBe('');
    expect(message).not.toMatch(/secret|u:p|example\.test|remote/i);
  });
});

describe('November catalog seed (e2e)', () => {
  const harness = new PostgresHarness();
  let client: Sql;
  let db: SeedDatabase;

  beforeAll(async () => {
    client = await harness.start();
    db = drizzle({ client, schema });
  });
  beforeEach(async () => harness.reset());
  afterAll(async () => harness.stop());

  async function counts() {
    const [row] = await client<Record<string, number>[]>`
      SELECT
        (SELECT count(*)::int FROM organizations) AS organizations,
        (SELECT count(*)::int FROM venues) AS venues,
        (SELECT count(*)::int FROM events) AS events,
        (SELECT count(*)::int FROM event_venues) AS event_venues,
        (SELECT count(*)::int FROM activities) AS activities,
        (SELECT count(*)::int FROM event_pass_types) AS pass_types,
        (SELECT count(*)::int FROM event_pass_type_activities) AS pass_type_activities,
        (SELECT count(*)::int FROM event_catalog_audit) AS audit`;
    return row;
  }

  async function passTypes(): Promise<Map<string, PassRow>> {
    const rows = await client<PassRow[]>`
      SELECT p.name, p.pass_class, p.price_cents, p.requires_pass_class,
        coalesce(
          json_agg(json_build_object('activity', a.name, 'access', l.access))
            FILTER (WHERE a.id IS NOT NULL),
          '[]'::json
        ) AS access
      FROM event_pass_types p
      LEFT JOIN event_pass_type_activities l ON l.pass_type_id = p.id
      LEFT JOIN activities a ON a.id = l.activity_id
      GROUP BY p.id`;
    return new Map(rows.map((row) => [row.name, { ...row, access: row.access.sort(byActivity) }]));
  }

  it('creates the November event, competitions and pass types on the first run', async () => {
    const summary = await seedNovemberCatalog(db);

    expect(summary.created).toEqual({
      organizations: 1,
      venues: 1,
      events: 1,
      eventVenues: 1,
      activities: 15,
      passTypes: 6,
      passTypeActivities: 15,
    });
    expect(await counts()).toEqual({
      organizations: 1,
      venues: 1,
      events: 1,
      event_venues: 1,
      activities: 15,
      pass_types: 6,
      pass_type_activities: 15,
      audit: 0,
    });

    const [venue] = await client<{ name: string }[]>`SELECT name FROM venues`;
    expect(venue.name).toBe('Estudio principal');
    const activities = await client<{ name: string; kind: string; status: string }[]>`
      SELECT name, kind, status FROM activities ORDER BY name`;
    expect(activities.map((activity) => activity.name).sort()).toEqual(
      [...breaking, ...popping, ...locking, ...dancehall, ...openStyles].sort(),
    );
    expect(new Set(activities.map((activity) => activity.kind))).toEqual(new Set(['competition']));
    expect(new Set(activities.map((activity) => activity.status))).toEqual(new Set(['active']));

    const passes = await passTypes();
    expect(passes.get('Pase completo Breaking')).toEqual({
      name: 'Pase completo Breaking',
      pass_class: 'full',
      price_cents: 200000,
      requires_pass_class: null,
      access: selectable(breaking),
    });
    expect(passes.get('Pase completo Popping')).toMatchObject({
      pass_class: 'full',
      price_cents: 200000,
      access: selectable(popping),
    });
    expect(passes.get('Pase completo Locking')).toMatchObject({
      pass_class: 'full',
      price_cents: 200000,
      access: selectable(locking),
    });
    expect(passes.get('Pase completo Dancehall')).toMatchObject({
      pass_class: 'full',
      price_cents: 200000,
      access: selectable(dancehall),
    });
    expect(passes.get('Entrada general')).toEqual({
      name: 'Entrada general',
      pass_class: 'general',
      price_cents: 100000,
      requires_pass_class: null,
      access: [],
    });
    expect(passes.get('Open Styles')).toEqual({
      name: 'Open Styles',
      pass_class: 'add_on',
      price_cents: 80000,
      requires_pass_class: 'full',
      access: [{ activity: 'Open Styles 1vs1', access: 'included' }],
    });
  });

  it('is a no-op on the second run', async () => {
    await seedNovemberCatalog(db);
    const before = await counts();
    const passesBefore = await passTypes();

    const summary = await seedNovemberCatalog(db);

    expect(Object.values(summary.created).every((count) => count === 0)).toBe(true);
    expect(summary.existing).toEqual({
      organizations: 1,
      venues: 1,
      events: 1,
      eventVenues: 1,
      activities: 15,
      passTypes: 6,
      passTypeActivities: 15,
    });
    expect(await counts()).toEqual(before);
    expect(await passTypes()).toEqual(passesBefore);
  });

  it('does not overwrite admin edits or recreate archived records on re-run', async () => {
    await seedNovemberCatalog(db);
    await client`UPDATE event_pass_types SET price_cents = 210000, version = version + 1
      WHERE name = 'Pase completo Breaking'`;
    await client`UPDATE activities SET status = 'archived', version = version + 1
      WHERE name = 'Breaking Kids'`;
    await client`DELETE FROM event_pass_type_activities
      WHERE pass_type_id = (SELECT id FROM event_pass_types WHERE name = 'Pase completo Locking')
        AND activity_id = (SELECT id FROM activities WHERE name = 'Locking 3v3')`;

    const summary = await seedNovemberCatalog(db);

    expect(Object.values(summary.created).every((count) => count === 0)).toBe(true);
    const passes = await passTypes();
    expect(passes.get('Pase completo Breaking')?.price_cents).toBe(210000);
    expect(passes.get('Pase completo Locking')?.access).toEqual(selectable(['Locking 1v1']));
    const kids = await client<{ status: string }[]>`
      SELECT status FROM activities WHERE name = 'Breaking Kids'`;
    expect(kids).toEqual([{ status: 'archived' }]);
  });
});
