import { createHash, randomBytes } from 'node:crypto';
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { type Sql } from 'postgres';
import { PostgresHarness } from './support/postgres-harness';

jest.setTimeout(120_000);

const migrationsFolder = resolve(__dirname, '../drizzle');
const catalogMigrationTag = '0011_event_catalog';

interface JournalEntry {
  idx: number;
  tag: string;
}

/** Copies the migrations that precede the catalog migration into a temporary folder. */
function migrationsBeforeCatalog(): string {
  const folder = mkdtempSync(join(tmpdir(), 'nb-migrations-'));
  mkdirSync(join(folder, 'meta'));
  const journal = JSON.parse(
    readFileSync(join(migrationsFolder, 'meta/_journal.json'), 'utf8'),
  ) as { entries: JournalEntry[] };
  const catalogIdx = journal.entries.find((entry) => entry.tag === catalogMigrationTag)?.idx;
  if (catalogIdx === undefined) {
    throw new Error(`Journal has no ${catalogMigrationTag} entry.`);
  }
  const entries = journal.entries.filter((entry) => entry.idx < catalogIdx);
  writeFileSync(join(folder, 'meta/_journal.json'), JSON.stringify({ ...journal, entries }));
  for (const file of readdirSync(join(migrationsFolder, 'meta'))) {
    if (file.endsWith('_snapshot.json')) {
      copyFileSync(join(migrationsFolder, 'meta', file), join(folder, 'meta', file));
    }
  }
  for (const entry of entries) {
    copyFileSync(join(migrationsFolder, `${entry.tag}.sql`), join(folder, `${entry.tag}.sql`));
  }
  return folder;
}

describe('event catalog schema (e2e)', () => {
  const harness = new PostgresHarness();
  let client: Sql;

  beforeAll(async () => {
    client = await harness.start();
  });

  beforeEach(async () => harness.reset());

  afterAll(async () => {
    await harness.stop();
  });

  async function insertContainers() {
    const [{ id: org }] = await client<
      { id: string }[]
    >`INSERT INTO organizations (name) VALUES ('Org') RETURNING id`;
    const [event, other] = await client<{ id: string }[]>`
      INSERT INTO events (organization_id, name, time_zone)
      VALUES (${org}, 'One', 'Etc/UTC'), (${org}, 'Two', 'Etc/UTC') RETURNING id`;
    const [{ id: venue }] = await client<
      { id: string }[]
    >`INSERT INTO venues (organization_id, name) VALUES (${org}, 'Hall') RETURNING id`;
    await client`INSERT INTO event_venues (organization_id, event_id, venue_id) VALUES (${org}, ${event.id}, ${venue}), (${org}, ${other.id}, ${venue})`;
    const [activity, foreign] = await client<{ id: string }[]>`
      INSERT INTO activities (event_id, venue_id, kind, name, starts_at, ends_at)
      VALUES (${event.id}, ${venue}, 'battle', 'Breaking 1v1', now(), now() + interval '1 hour'),
        (${other.id}, ${venue}, 'battle', 'Other battle', now(), now() + interval '1 hour')
      RETURNING id`;
    return { event: event.id, other: other.id, activity: activity.id, foreign: foreign.id };
  }

  async function fixture() {
    const containers = await insertContainers();
    const [full, otherFull] = await client<{ id: string }[]>`
      INSERT INTO event_pass_types (event_id, name, pass_class, price_cents)
      VALUES (${containers.event}, 'Full pass', 'full', 120000),
        (${containers.other}, 'Full pass', 'full', 90000)
      RETURNING id`;
    const registration = await insertRegistration(containers.event);
    const otherRegistration = await insertRegistration(containers.other);
    return {
      ...containers,
      full: full.id,
      otherFull: otherFull.id,
      registration,
      otherRegistration,
    };
  }

  async function insertRegistration(eventId: string) {
    const [{ id: participant }] = await client<
      { id: string }[]
    >`INSERT INTO participants (full_name) VALUES ('Dancer') RETURNING id`;
    const [{ id }] = await client<
      { id: string }[]
    >`INSERT INTO event_registrations (event_id, participant_id) VALUES (${eventId}, ${participant}) RETURNING id`;
    return id;
  }

  async function operator() {
    const [{ id: userId }] = await client<
      { id: string }[]
    >`INSERT INTO users (email, display_name, active) VALUES (${randomBytes(8).toString('hex') + '@example.com'}, 'Operator', true) RETURNING id`;
    const [{ id: sessionId }] = await client<
      { id: string }[]
    >`INSERT INTO auth_sessions (user_id, token_digest, expires_at) VALUES (${userId}, ${createHash('sha256').update(randomBytes(32)).digest('hex')}, now() + interval '1 hour') RETURNING id`;
    return { userId, sessionId };
  }

  it('migrates existing activities to active status at version 1', async () => {
    await client.unsafe('DROP SCHEMA public CASCADE');
    await client.unsafe('DROP SCHEMA drizzle CASCADE');
    await client.unsafe('CREATE SCHEMA public');
    const previous = migrationsBeforeCatalog();
    try {
      await migrate(drizzle(client), { migrationsFolder: previous });
    } finally {
      rmSync(previous, { recursive: true, force: true });
    }
    const { activity } = await insertContainers();

    await migrate(drizzle(client), { migrationsFolder });

    const [row] = await client<{ status: string; version: number }[]>`
      SELECT status, version FROM activities WHERE id = ${activity}`;
    expect(row).toEqual({ status: 'active', version: 1 });
  });

  it('rejects invalid activity status and version', async () => {
    const { activity } = await insertContainers();
    await expect(
      client`UPDATE activities SET status = 'deleted' WHERE id = ${activity}`,
    ).rejects.toThrow(/activities_status_ck/);
    await expect(client`UPDATE activities SET version = 0 WHERE id = ${activity}`).rejects.toThrow(
      /activities_version_ck/,
    );
  });

  it('rejects invalid pass class, price, status, version and blank names', async () => {
    const { event } = await insertContainers();
    const insert = (
      name: string,
      passClass: string,
      price: number,
      status = 'active',
      version = 1,
    ) =>
      client`INSERT INTO event_pass_types (event_id, name, pass_class, price_cents, status, version)
        VALUES (${event}, ${name}, ${passClass}, ${price}, ${status}, ${version})`;

    await expect(insert('VIP', 'vip', 100)).rejects.toThrow(/event_pass_types_pass_class_ck/);
    await expect(insert('Full', 'full', -1)).rejects.toThrow(/event_pass_types_price_cents_ck/);
    await expect(insert('Full', 'full', 100, 'deleted')).rejects.toThrow(
      /event_pass_types_status_ck/,
    );
    await expect(insert('Full', 'full', 100, 'active', 0)).rejects.toThrow(
      /event_pass_types_version_ck/,
    );
    await expect(insert('   ', 'full', 100)).rejects.toThrow(/event_pass_types_name_ck/);
    await expect(insert('General', 'general', 0)).resolves.toBeDefined();
  });

  it('allows requires_pass_class only on add-ons and only for full or general', async () => {
    const { event } = await insertContainers();
    const insert = (name: string, passClass: string, requires: string | null) =>
      client`INSERT INTO event_pass_types (event_id, name, pass_class, price_cents, requires_pass_class)
        VALUES (${event}, ${name}, ${passClass}, 5000, ${requires})`;

    await expect(insert('Full', 'full', 'general')).rejects.toThrow(
      /event_pass_types_requires_pass_class_ck/,
    );
    await expect(insert('Loop', 'add_on', 'add_on')).rejects.toThrow(
      /event_pass_types_requires_pass_class_ck/,
    );
    await expect(insert('Open Styles', 'add_on', 'full')).resolves.toBeDefined();
    await expect(insert('Merch', 'add_on', null)).resolves.toBeDefined();
  });

  it('keeps active pass type names unique per event, ignoring case and spacing', async () => {
    const { event, other, full } = await fixture();

    await expect(
      client`INSERT INTO event_pass_types (event_id, name, pass_class, price_cents)
        VALUES (${event}, ' full PASS ', 'full', 1)`,
    ).rejects.toThrow(/event_pass_types_event_active_name_uq/);
    await expect(
      client`INSERT INTO event_pass_types (event_id, name, pass_class, price_cents)
        VALUES (${other}, 'Full pass 2', 'full', 1)`,
    ).resolves.toBeDefined();
    await client`UPDATE event_pass_types SET status = 'archived' WHERE id = ${full}`;
    await expect(
      client`INSERT INTO event_pass_types (event_id, name, pass_class, price_cents)
        VALUES (${event}, 'Full pass', 'full', 1)`,
    ).resolves.toBeDefined();
  });

  it('links pass types to activities of the same event only, with a valid access', async () => {
    const { event, activity, foreign, full } = await fixture();

    await expect(
      client`INSERT INTO event_pass_type_activities (event_id, pass_type_id, activity_id, access)
        VALUES (${event}, ${full}, ${foreign}, 'selectable')`,
    ).rejects.toThrow(/event_pass_type_activities_activity_scope_fk/);
    await expect(
      client`INSERT INTO event_pass_type_activities (event_id, pass_type_id, activity_id, access)
        VALUES (${event}, ${full}, ${activity}, 'optional')`,
    ).rejects.toThrow(/event_pass_type_activities_access_ck/);
    await client`INSERT INTO event_pass_type_activities (event_id, pass_type_id, activity_id, access)
      VALUES (${event}, ${full}, ${activity}, 'selectable')`;
    await expect(
      client`INSERT INTO event_pass_type_activities (event_id, pass_type_id, activity_id, access)
        VALUES (${event}, ${full}, ${activity}, 'included')`,
    ).rejects.toThrow(/event_pass_type_activities_pk/);
  });

  it('rejects cross-event registration passes and duplicate pass types per registration', async () => {
    const { event, full, otherFull, registration, otherRegistration } = await fixture();

    await expect(
      client`INSERT INTO event_registration_passes (event_id, event_registration_id, pass_type_id, price_cents)
        VALUES (${event}, ${registration}, ${otherFull}, 90000)`,
    ).rejects.toThrow(/event_registration_passes_pass_type_scope_fk/);
    await expect(
      client`INSERT INTO event_registration_passes (event_id, event_registration_id, pass_type_id, price_cents)
        VALUES (${event}, ${otherRegistration}, ${full}, 120000)`,
    ).rejects.toThrow(/event_registration_passes_registration_scope_fk/);
    await expect(
      client`INSERT INTO event_registration_passes (event_id, event_registration_id, pass_type_id, price_cents)
        VALUES (${event}, ${registration}, ${full}, -1)`,
    ).rejects.toThrow(/event_registration_passes_price_cents_ck/);

    await client`INSERT INTO event_registration_passes (event_id, event_registration_id, pass_type_id, price_cents)
      VALUES (${event}, ${registration}, ${full}, 120000)`;
    await expect(
      client`INSERT INTO event_registration_passes (event_id, event_registration_id, pass_type_id, price_cents)
        VALUES (${event}, ${registration}, ${full}, 120000)`,
    ).rejects.toThrow(/event_registration_passes_registration_pass_type_uq/);
  });

  it('allows several different passes per registration with their own price snapshots', async () => {
    const { event, full, registration } = await fixture();
    const [secondFull, general] = await client<{ id: string }[]>`
      INSERT INTO event_pass_types (event_id, name, pass_class, price_cents)
      VALUES (${event}, 'Full pass popping', 'full', 110000), (${event}, 'General entry', 'general', 30000)
      RETURNING id`;

    await client`INSERT INTO event_registration_passes (event_id, event_registration_id, pass_type_id, price_cents)
      VALUES (${event}, ${registration}, ${full}, 100000),
        (${event}, ${registration}, ${secondFull.id}, 110000),
        (${event}, ${registration}, ${general.id}, 30000)`;
    await client`UPDATE event_pass_types SET price_cents = 150000, version = version + 1 WHERE id = ${full}`;

    const rows = await client<{ priceCents: number }[]>`
      SELECT price_cents AS "priceCents" FROM event_registration_passes
      WHERE event_registration_id = ${registration} ORDER BY price_cents`;
    expect(rows.map((row) => row.priceCents)).toEqual([30000, 100000, 110000]);
  });

  it('stores selections per purchased pass and rejects activities from another event', async () => {
    const { event, activity, foreign, full, registration } = await fixture();
    const [{ id: pass }] = await client<{ id: string }[]>`
      INSERT INTO event_registration_passes (event_id, event_registration_id, pass_type_id, price_cents)
      VALUES (${event}, ${registration}, ${full}, 120000) RETURNING id`;

    await expect(
      client`INSERT INTO event_registration_pass_selections (event_id, registration_pass_id, activity_id)
        VALUES (${event}, ${pass}, ${foreign})`,
    ).rejects.toThrow(/event_registration_pass_selections_activity_scope_fk/);
    await client`INSERT INTO event_registration_pass_selections (event_id, registration_pass_id, activity_id)
      VALUES (${event}, ${pass}, ${activity})`;
    await expect(
      client`INSERT INTO event_registration_pass_selections (event_id, registration_pass_id, activity_id)
        VALUES (${event}, ${pass}, ${activity})`,
    ).rejects.toThrow(/event_registration_pass_selections_pk/);
  });

  it('keeps catalog audit facts append-only and validates their shape', async () => {
    const { event, full } = await fixture();
    const { userId, sessionId } = await operator();
    const insert = (entityType: string, operation: string, before: unknown, after: unknown) =>
      client<
        { id: string }[]
      >`INSERT INTO event_catalog_audit (event_id, actor_user_id, actor_session_id, entity_type, entity_id, operation, before, after)
        VALUES (${event}, ${userId}, ${sessionId}, ${entityType}, ${full}, ${operation},
          ${before === null ? null : JSON.stringify(before)}::jsonb,
          ${after === null ? null : JSON.stringify(after)}::jsonb)
        RETURNING id`;

    await expect(insert('venue', 'create', null, { name: 'x' })).rejects.toThrow(
      /event_catalog_audit_entity_type_ck/,
    );
    await expect(insert('pass_type', 'delete', { name: 'x' }, null)).rejects.toThrow(
      /event_catalog_audit_operation_ck/,
    );
    await expect(insert('pass_type', 'create', { name: 'x' }, { name: 'x' })).rejects.toThrow(
      /event_catalog_audit_state_ck/,
    );
    await expect(insert('pass_type', 'update', null, { name: 'x' })).rejects.toThrow(
      /event_catalog_audit_state_ck/,
    );

    const [{ id }] = await insert('pass_type', 'create', null, { name: 'Full pass' });
    await expect(
      client`UPDATE event_catalog_audit SET operation = 'update' WHERE id = ${id}`,
    ).rejects.toThrow(/catalog audit facts are immutable/);
    await expect(client`DELETE FROM event_catalog_audit WHERE id = ${id}`).rejects.toThrow(
      /catalog audit facts are immutable/,
    );
    const [{ count }] = await client<
      { count: number }[]
    >`SELECT count(*)::int AS count FROM event_catalog_audit`;
    expect(count).toBe(1);
  });
});
