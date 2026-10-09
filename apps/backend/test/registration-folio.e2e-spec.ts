import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { type Sql } from 'postgres';
import * as schema from '@/database/schema';
import {
  confirmRegistration,
  FOLIO_ATTEMPTS,
} from '@/events/registration-confirmation/confirm-registration';
import { PostgresHarness } from './support/postgres-harness';

jest.setTimeout(120_000);

const folioPattern = (prefix: string) =>
  new RegExp(`^${prefix}-[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{4}$`);

// Database and helper contract for registration folios (#174 D2, D3): per-event prefix, system-wide
// uniqueness, assignment on confirmation with collision retry, immutability and the 0017 backfill.
describe('registration folio (e2e)', () => {
  const harness = new PostgresHarness();
  const migrationsFolder = resolve(__dirname, '../drizzle');
  let client: Sql;
  let db: ReturnType<typeof drizzle<typeof schema>>;

  beforeAll(async () => {
    client = await harness.start();
    db = drizzle({ client, schema });
  });
  beforeEach(async () => harness.reset());
  afterAll(async () => harness.stop());

  async function event(prefix?: string) {
    const [{ id: org }] = await client<
      { id: string }[]
    >`INSERT INTO organizations (name) VALUES ('Org') RETURNING id`;
    const [{ id }] = prefix
      ? await client<{ id: string }[]>`
          INSERT INTO events (organization_id, name, time_zone, folio_prefix)
          VALUES (${org}, 'Event', 'Etc/UTC', ${prefix}) RETURNING id`
      : await client<{ id: string }[]>`
          INSERT INTO events (organization_id, name, time_zone)
          VALUES (${org}, 'Event', 'Etc/UTC') RETURNING id`;
    return id;
  }
  async function pending(eventId: string) {
    const [{ id }] = await client<{ id: string }[]>`
      WITH participant AS (INSERT INTO participants (full_name) VALUES ('Buyer') RETURNING id)
      INSERT INTO event_registrations (event_id, participant_id)
      SELECT ${eventId}, id FROM participant RETURNING id`;
    return id;
  }
  async function folioOf(id: string) {
    const [row] = await client<{ folio: string | null; status: string }[]>`
      SELECT folio, status FROM event_registrations WHERE id = ${id}`;
    return row;
  }
  const confirm = (eventId: string, registrationId: string, next?: (prefix: string) => string) =>
    db.transaction((tx) =>
      confirmRegistration(tx, { eventId, registrationId, source: 'admin_cash' }, next),
    );

  it('defaults the event prefix to EV and accepts only short uppercase prefixes', async () => {
    const eventId = await event();
    expect(await client`SELECT folio_prefix FROM events WHERE id = ${eventId}`).toEqual([
      { folio_prefix: 'EV' },
    ]);
    await expect(event('LMP')).resolves.toBeDefined();
    for (const prefix of ['L', 'lmp', '1MP', 'LMP-1', 'TOOLONG'])
      await expect(event(prefix)).rejects.toMatchObject({
        code: '23514',
        constraint_name: 'events_folio_prefix_ck',
      });
  });

  it('assigns a folio with the event prefix once and keeps it on a second confirmation', async () => {
    const eventId = await event('LMP');
    const id = await pending(eventId);
    const confirmed = await confirm(eventId, id);
    expect(confirmed?.folio).toMatch(folioPattern('LMP'));
    expect(await folioOf(id)).toEqual({ folio: confirmed?.folio, status: 'confirmed' });
    await expect(confirm(eventId, id)).resolves.toBeNull();
    expect((await folioOf(id)).folio).toBe(confirmed?.folio);
    // Another event's registration id is not confirmed through this event.
    const otherEvent = await event('OTR');
    const foreign = await pending(otherEvent);
    await expect(confirm(eventId, foreign)).resolves.toBeNull();
    expect(await folioOf(foreign)).toEqual({ folio: null, status: 'pending_payment' });
  });

  it('retries a colliding folio under a savepoint without aborting the outer transaction', async () => {
    const eventId = await event('LMP');
    const taken = await pending(eventId);
    await confirm(eventId, taken, () => 'LMP-2222');
    const id = await pending(eventId);
    const candidates = ['LMP-2222', 'LMP-3333'];
    const result = await db.transaction(async (tx) => {
      const confirmed = await confirmRegistration(
        tx,
        { eventId, registrationId: id, source: 'approved_payment' },
        () => candidates.shift() ?? 'LMP-9999',
      );
      // The outer transaction is still usable after the rolled-back attempt.
      await tx.execute(sql`SELECT 1`);
      return confirmed;
    });
    expect(result?.folio).toBe('LMP-3333');
    expect(candidates).toEqual([]);
    expect(await folioOf(id)).toEqual({ folio: 'LMP-3333', status: 'confirmed' });
  });

  it('gives up after bounded attempts and leaves the registration pending', async () => {
    const eventId = await event('LMP');
    await confirm(eventId, await pending(eventId), () => 'LMP-2222');
    const id = await pending(eventId);
    let attempts = 0;
    await expect(
      confirm(eventId, id, () => {
        attempts += 1;
        return 'LMP-2222';
      }),
    ).rejects.toThrow(/unique registration folio/);
    expect(attempts).toBe(FOLIO_ATTEMPTS);
    expect(await folioOf(id)).toEqual({ folio: null, status: 'pending_payment' });
  });

  it('rejects the same folio in another event', async () => {
    const first = await event('LMP');
    const second = await event('LMP');
    await confirm(first, await pending(first), () => 'LMP-4444');
    const id = await pending(second);
    await expect(
      client`UPDATE event_registrations SET status = 'confirmed', confirmation_source = 'admin_cash',
        confirmed_at = now(), folio = 'LMP-4444' WHERE id = ${id}`,
    ).rejects.toMatchObject({ code: '23505', constraint_name: 'event_registrations_folio_uq' });
  });

  it('never changes or clears a folio, even when the registration is voided', async () => {
    const eventId = await event('LMP');
    const id = await pending(eventId);
    const confirmed = await confirm(eventId, id);
    for (const folio of ['LMP-5555', null])
      await expect(
        client`UPDATE event_registrations SET folio = ${folio} WHERE id = ${id}`,
      ).rejects.toMatchObject({
        code: '23514',
        constraint_name: 'event_registrations_folio_immutable',
      });
    await client`UPDATE event_registrations SET status = 'voided', confirmation_source = NULL,
      confirmed_at = NULL WHERE id = ${id}`;
    expect(await folioOf(id)).toEqual({ folio: confirmed?.folio, status: 'voided' });
  });

  it('assigns a folio to a confirmation written without one, and none to pending registrations', async () => {
    const eventId = await event('LMP');
    const id = await pending(eventId);
    await client`UPDATE event_registrations SET status = 'confirmed', confirmation_source = 'admin_cash',
      confirmed_at = now() WHERE id = ${id}`;
    expect((await folioOf(id)).folio).toMatch(folioPattern('LMP'));
    await expect(
      client`INSERT INTO event_registrations (event_id, participant_id, folio)
        VALUES (${eventId}, (SELECT id FROM participants LIMIT 1), 'LMP-6666')`,
    ).rejects.toMatchObject({ code: '23514' });
  });

  it('backfills confirmed registrations written before folios existed', async () => {
    // Rebuild the schema up to 0016 only, write legacy rows, then apply the rest.
    const journal = JSON.parse(
      readFileSync(join(migrationsFolder, 'meta/_journal.json'), 'utf8'),
    ) as { entries: { idx: number; tag: string }[] };
    const partial = mkdtempSync(join(tmpdir(), 'nb-migrations-'));
    try {
      mkdirSync(join(partial, 'meta'));
      const entries = journal.entries.filter((entry) => entry.idx <= 16);
      for (const entry of entries)
        copyFileSync(join(migrationsFolder, `${entry.tag}.sql`), join(partial, `${entry.tag}.sql`));
      writeFileSync(join(partial, 'meta/_journal.json'), JSON.stringify({ ...journal, entries }));
      await client.unsafe('DROP SCHEMA public CASCADE');
      await client.unsafe('DROP SCHEMA drizzle CASCADE');
      await client.unsafe('CREATE SCHEMA public');
      await migrate(drizzle(client), { migrationsFolder: partial });
    } finally {
      rmSync(partial, { recursive: true, force: true });
    }
    const [{ id: org }] = await client<
      { id: string }[]
    >`INSERT INTO organizations (name) VALUES ('Org') RETURNING id`;
    const [{ id: eventId }] = await client<{ id: string }[]>`
      INSERT INTO events (organization_id, name, time_zone) VALUES (${org}, 'Legacy', 'Etc/UTC') RETURNING id`;
    const people = await client<{ id: string }[]>`
      INSERT INTO participants (full_name) VALUES ('A'), ('B'), ('C') RETURNING id`;
    const legacy = await client<{ id: string; status: string }[]>`
      INSERT INTO event_registrations (event_id, participant_id, status, confirmation_source, confirmed_at)
      VALUES (${eventId}, ${people[0].id}, 'confirmed', 'admin_cash', now()),
        (${eventId}, ${people[1].id}, 'confirmed', 'approved_payment', now()),
        (${eventId}, ${people[2].id}, 'pending_payment', NULL, NULL)
      RETURNING id, status`;
    await migrate(drizzle(client), { migrationsFolder });
    const rows = await client<{ id: string; folio: string | null; prefix: string }[]>`
      SELECT r.id, r.folio, e.folio_prefix AS prefix
      FROM event_registrations r JOIN events e ON e.id = r.event_id`;
    const byId = new Map(rows.map((row) => [row.id, row]));
    const [cash, online, open] = legacy.map((row) => byId.get(row.id));
    expect(cash?.prefix).toBe('EV');
    expect(cash?.folio).toMatch(folioPattern('EV'));
    expect(online?.folio).toMatch(folioPattern('EV'));
    expect(online?.folio).not.toBe(cash?.folio);
    expect(open?.folio).toBeNull();
  });
});
