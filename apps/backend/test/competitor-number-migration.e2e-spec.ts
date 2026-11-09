import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { PostgreSqlContainer } from '@testcontainers/postgresql';

jest.setTimeout(180_000);

const migrationsFolder = resolve(__dirname, '../drizzle');
const firstCompetitorMigration = '0040_competitor_number';

type Journal = { entries: { idx: number; tag: string }[] };

// A copy of the migrations folder whose journal stops before #377, so the test can load data on
// the previous schema and then apply 0040 and 0041 on top of it.
function migrationsBeforeCompetitorNumber(): string {
  const folder = mkdtempSync(join(tmpdir(), 'nb-migrations-'));
  cpSync(migrationsFolder, folder, { recursive: true });
  const journalPath = join(folder, 'meta/_journal.json');
  const journal = JSON.parse(readFileSync(journalPath, 'utf8')) as Journal;
  const cut = journal.entries.findIndex((entry) => entry.tag === firstCompetitorMigration);
  expect(cut).toBeGreaterThan(0);
  writeFileSync(
    journalPath,
    JSON.stringify({ ...journal, entries: journal.entries.slice(0, cut) }),
  );
  return folder;
}

const previousKinds = [
  'manual_registration',
  'cash_confirmation',
  'pass_assignment',
  'pass_selection_change',
  'online_registration',
  'payment_approval',
  'registration_expiry',
  'complimentary_confirmation',
  'pass_removal',
  'registration_void',
  'registration_correction',
  'registration_discipline_swap',
  'cash_correction',
];

it('0040 and 0041 apply on a database with existing registrations and audit rows', async () => {
  const container = await new PostgreSqlContainer('postgres:16').start();
  const client = postgres(container.getConnectionUri(), { onnotice: () => undefined });
  const previousFolder = migrationsBeforeCompetitorNumber();
  try {
    await migrate(drizzle(client), { migrationsFolder: previousFolder });
    const [{ id: organization }] = await client<{ id: string }[]>`
      INSERT INTO organizations (name) VALUES ('O') RETURNING id`;
    const [{ id: event }] = await client<{ id: string }[]>`
      INSERT INTO events (organization_id, name, time_zone)
      VALUES (${organization}, 'E', 'Etc/UTC') RETURNING id`;
    const [{ id: participant }] = await client<{ id: string }[]>`
      INSERT INTO participants (full_name) VALUES ('A') RETURNING id`;
    const [{ id: registration }] = await client<{ id: string }[]>`
      INSERT INTO event_registrations
        (event_id, participant_id, status, confirmation_source, confirmed_at, folio)
      VALUES (${event}, ${participant}, 'confirmed', 'admin_cash', now(), 'F-1') RETURNING id`;
    const insertAudit = (operationType: string) => client`
      INSERT INTO registration_operation_audit
        (event_id, registration_id, participant_id, operation_type, actor_kind,
         before_state, after_state, facts, affected_activity_ids)
      VALUES (${event}, ${registration}, ${participant}, ${operationType}, 'system',
        '{}', '{}', '{}', '{}')`;
    const auditKinds = async () => {
      const [{ definition }] = await client<{ definition: string }[]>`
        SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint
        WHERE conname = 'registration_operation_audit_operation_type_check'`;
      return [...definition.matchAll(/'([a-z_]+)'::text/g)].map((match) => match[1]).sort();
    };
    const auditCount = async () =>
      (
        await client<{ count: number }[]>`
        SELECT count(*)::int AS count FROM registration_operation_audit`
      )[0].count;

    expect(await auditKinds()).toEqual([...previousKinds].sort());
    await insertAudit('pass_assignment');
    const auditRowsBefore = await auditCount();

    await migrate(drizzle(client), { migrationsFolder });

    expect(await auditCount()).toBe(auditRowsBefore);
    // Existing registrations get no number, and the registration table is unchanged.
    const [{ numbers }] = await client<{ numbers: number }[]>`
      SELECT count(*)::int AS numbers FROM event_competitor_numbers`;
    expect(numbers).toBe(0);
    const columns = await client<{ name: string }[]>`
      SELECT column_name AS name FROM information_schema.columns
      WHERE table_name = 'event_registrations' AND column_name = 'competitor_number'`;
    expect(columns).toEqual([]);
    const constraints = await client<{ name: string }[]>`
      SELECT conname AS name FROM pg_constraint
      WHERE conname LIKE 'event_competitor_numbers_%'
        OR conname = 'registration_operation_audit_operation_type_check'
      ORDER BY 1`;
    expect(constraints.map(({ name }) => name)).toEqual([
      'event_competitor_numbers_activity_fk',
      'event_competitor_numbers_activity_number_uq',
      'event_competitor_numbers_number_ck',
      'event_competitor_numbers_pk',
      'event_competitor_numbers_registration_fk',
      'registration_operation_audit_operation_type_check',
    ]);
    expect(await auditKinds()).toEqual([...previousKinds, 'competitor_number_assignment'].sort());
    await insertAudit('competitor_number_assignment');
    await expect(insertAudit('bogus')).rejects.toBeTruthy();
  } finally {
    await client.end({ timeout: 5 });
    await container.stop();
    rmSync(previousFolder, { recursive: true, force: true });
  }
});
