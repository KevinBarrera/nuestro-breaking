import { createHash } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/postgres-js';
import { type Sql } from 'postgres';
import * as schema from '@/database/schema';
import {
  DEFAULT_ORGANIZATION_NAME,
  resolveEventOrganization,
} from '@/events/admin-events/event-organization';
import { PostgresHarness } from './support/postgres-harness';

jest.setTimeout(120_000);

// Foundation for the admin event lifecycle (#213 T1): the `archived_at` column, the append-only
// event audit, and the organization a new event belongs to (D1).
describe('event admin foundation (e2e)', () => {
  const harness = new PostgresHarness();
  let client: Sql;
  let db: ReturnType<typeof drizzle<typeof schema>>;

  beforeAll(async () => {
    client = await harness.start();
    db = drizzle({ client, schema });
  });
  beforeEach(async () => harness.reset());
  afterAll(async () => harness.stop());

  const violation = (code: string, constraint: string) => ({ code, constraint_name: constraint });

  async function actor() {
    const [{ id: userId }] = await client<{ id: string }[]>`
      INSERT INTO users (email, display_name) VALUES ('admin@example.test', 'Admin') RETURNING id`;
    const [{ id: sessionId }] = await client<{ id: string }[]>`
      INSERT INTO auth_sessions (user_id, token_digest, expires_at)
      VALUES (${userId}, ${createHash('sha256').update('session').digest('hex')}, now() + interval '1 hour')
      RETURNING id`;
    return { userId, sessionId };
  }

  async function organizationNames() {
    const rows = await client<{ name: string }[]>`SELECT name FROM organizations ORDER BY name`;
    return rows.map((row) => row.name);
  }

  it('applies migration 0021 with explicitly named constraints and a nullable archived_at', async () => {
    const [column] = await client<{ type: string; nullable: string; default: string | null }[]>`
      SELECT data_type AS type, is_nullable AS nullable, column_default AS default
      FROM information_schema.columns WHERE table_name = 'events' AND column_name = 'archived_at'`;
    expect(column).toEqual({ type: 'timestamp with time zone', nullable: 'YES', default: null });

    const constraints = await client<{ name: string }[]>`
      SELECT conname AS name FROM pg_constraint
      WHERE conrelid = 'event_admin_audit'::regclass ORDER BY conname`;
    // No foreign key to `events`: the `deleted` row must outlive the event.
    expect(constraints.map((row) => row.name)).toEqual([
      'event_admin_audit_action_ck',
      'event_admin_audit_actor_fk',
      'event_admin_audit_pk',
      'event_admin_audit_session_fk',
    ]);
    const indexes = await client<{ name: string }[]>`
      SELECT indexname AS name FROM pg_indexes
      WHERE tablename = 'event_admin_audit' ORDER BY indexname`;
    expect(indexes.map((row) => row.name)).toEqual([
      'event_admin_audit_event_created_idx',
      'event_admin_audit_pk',
    ]);
  });

  it('keeps event audit rows append-only and limits the actions', async () => {
    const { userId, sessionId } = await actor();
    const eventId = '00000000-0000-4000-8000-000000000213';
    const insert = (action: string) => client`
      INSERT INTO event_admin_audit (event_id, event_slug, event_name, action, actor_user_id, actor_session_id)
      VALUES (${eventId}, 'deleted-event', 'Deleted event', ${action}, ${userId}, ${sessionId})`;

    // The event never existed: the audit row does not depend on it.
    await insert('deleted');
    await expect(insert('renamed')).rejects.toMatchObject(
      violation('23514', 'event_admin_audit_action_ck'),
    );
    await expect(client`UPDATE event_admin_audit SET event_name = 'Changed'`).rejects.toThrow(
      'event admin audit facts are immutable',
    );
    await expect(client`DELETE FROM event_admin_audit`).rejects.toThrow(
      'event admin audit facts are immutable',
    );
    const rows = await client`SELECT action, event_name, details FROM event_admin_audit`;
    expect(rows).toEqual([{ action: 'deleted', event_name: 'Deleted event', details: {} }]);
  });

  it('creates the default organization when none exists and reuses it afterwards', async () => {
    const first = await db.transaction((tx) => resolveEventOrganization(tx));
    const second = await db.transaction((tx) => resolveEventOrganization(tx));

    expect(first.ok).toBe(true);
    expect(second).toEqual(first);
    expect(await organizationNames()).toEqual([DEFAULT_ORGANIZATION_NAME]);
  });

  it('uses the existing single organization', async () => {
    const [{ id }] = await client<{ id: string }[]>`
      INSERT INTO organizations (name) VALUES ('Existing') RETURNING id`;

    await expect(db.transaction((tx) => resolveEventOrganization(tx))).resolves.toEqual({
      ok: true,
      organizationId: id,
    });
    expect(await organizationNames()).toEqual(['Existing']);
  });

  it('signals organization_ambiguous when more than one organization exists', async () => {
    await client`INSERT INTO organizations (name) VALUES ('One'), ('Two')`;

    await expect(db.transaction((tx) => resolveEventOrganization(tx))).resolves.toEqual({
      ok: false,
      code: 'organization_ambiguous',
    });
    expect(await organizationNames()).toEqual(['One', 'Two']);
  });

  it('creates a single organization when two first events are created at once', async () => {
    // Each transaction holds its connection a moment after resolving, so without the lock both
    // would see an empty table and insert.
    const resolveSlowly = () =>
      db.transaction(async (tx) => {
        const result = await resolveEventOrganization(tx);
        await tx.execute(sql`SELECT pg_sleep(0.2)`);
        return result;
      });

    const [first, second] = await Promise.all([resolveSlowly(), resolveSlowly()]);

    expect(first).toEqual(second);
    expect(await organizationNames()).toEqual([DEFAULT_ORGANIZATION_NAME]);
  });

  it('rolls the created organization back with the caller transaction', async () => {
    await expect(
      db.transaction(async (tx) => {
        await resolveEventOrganization(tx);
        throw new Error('event insert failed');
      }),
    ).rejects.toThrow('event insert failed');

    expect(await organizationNames()).toEqual([]);
  });
});
