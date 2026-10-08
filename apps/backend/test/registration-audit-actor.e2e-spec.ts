import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { type Sql } from 'postgres';
import { PostgresHarness } from './support/postgres-harness';

jest.setTimeout(120_000);

type Fact = {
  kind: string;
  userId: string | null;
  sessionId: string | null;
  operation: string;
  amount?: number | null;
};

// Database contract for non-admin registration audit (#174 D4): actor kind, actor pairing,
// new operation types and the amount rule, on top of the unchanged immutability trigger.
describe('registration audit actor (e2e)', () => {
  const harness = new PostgresHarness();
  const migrationsFolder = resolve(__dirname, '../drizzle');
  let client: Sql;

  beforeAll(async () => {
    client = await harness.start();
  });
  beforeEach(async () => harness.reset());
  afterAll(async () => harness.stop());

  async function fixture() {
    const [{ id: org }] = await client<
      { id: string }[]
    >`INSERT INTO organizations (name) VALUES ('Org') RETURNING id`;
    const [{ id: eventId }] = await client<{ id: string }[]>`
      INSERT INTO events (organization_id, name, time_zone) VALUES (${org}, 'One', 'Etc/UTC') RETURNING id`;
    const [{ id: participantId }] = await client<
      { id: string }[]
    >`INSERT INTO participants (full_name) VALUES ('Buyer') RETURNING id`;
    const [{ id: registrationId }] = await client<{ id: string }[]>`
      INSERT INTO event_registrations (event_id, participant_id) VALUES (${eventId}, ${participantId}) RETURNING id`;
    const [{ id: userId }] = await client<
      { id: string }[]
    >`INSERT INTO users (email, display_name, active) VALUES ('admin@example.com', 'Admin', true) RETURNING id`;
    const [{ id: sessionId }] = await client<{ id: string }[]>`
      INSERT INTO auth_sessions (user_id, token_digest, expires_at)
      VALUES (${userId}, 'digest', now() + interval '1 hour') RETURNING id`;
    return { eventId, participantId, registrationId, userId, sessionId };
  }

  function insertFact(ids: Awaited<ReturnType<typeof fixture>>, fact: Fact) {
    return client<{ id: string }[]>`
      INSERT INTO registration_operation_audit (
        operation_type, actor_kind, actor_user_id, session_id, event_id, registration_id,
        participant_id, amount_cents, before_state, after_state)
      VALUES (${fact.operation}, ${fact.kind}, ${fact.userId}, ${fact.sessionId}, ${ids.eventId},
        ${ids.registrationId}, ${ids.participantId}, ${fact.amount ?? null}, '{}'::jsonb, '{}'::jsonb)
      RETURNING id`;
  }

  it('keeps admin facts tied to a user and session and rejects partial admin identity', async () => {
    const ids = await fixture();
    const admin = { kind: 'admin', userId: ids.userId, sessionId: ids.sessionId };
    await expect(insertFact(ids, { ...admin, operation: 'pass_assignment' })).resolves.toHaveLength(
      1,
    );
    for (const partial of [
      { ...admin, userId: null },
      { ...admin, sessionId: null },
      { ...admin, userId: null, sessionId: null },
    ])
      await expect(insertFact(ids, { ...partial, operation: 'pass_assignment' })).rejects.toThrow(
        /registration_operation_audit_actor_ck/,
      );
  });

  it('accepts public and system facts without identity and rejects them with a user or session', async () => {
    const ids = await fixture();
    await expect(
      insertFact(ids, {
        kind: 'public',
        userId: null,
        sessionId: null,
        operation: 'online_registration',
      }),
    ).resolves.toHaveLength(1);
    await expect(
      insertFact(ids, {
        kind: 'system',
        userId: null,
        sessionId: null,
        operation: 'payment_approval',
        amount: 45000,
      }),
    ).resolves.toHaveLength(1);
    for (const kind of ['public', 'system'])
      for (const identity of [
        { userId: ids.userId, sessionId: null },
        { userId: null, sessionId: ids.sessionId },
        { userId: ids.userId, sessionId: ids.sessionId },
      ])
        await expect(
          insertFact(ids, { kind, ...identity, operation: 'online_registration' }),
        ).rejects.toThrow(/registration_operation_audit_actor_ck/);
  });

  it('rejects an unknown actor kind and a missing one', async () => {
    const ids = await fixture();
    await expect(
      insertFact(ids, {
        kind: 'buyer',
        userId: null,
        sessionId: null,
        operation: 'online_registration',
      }),
    ).rejects.toThrow(/registration_operation_audit_actor_kind_check/);
    await expect(client`
      INSERT INTO registration_operation_audit (operation_type, event_id, registration_id,
        participant_id, before_state, after_state)
      VALUES ('online_registration', ${ids.eventId}, ${ids.registrationId}, ${ids.participantId},
        '{}'::jsonb, '{}'::jsonb)`).rejects.toThrow(/actor_kind/);
  });

  it('requires an amount for both confirmations and no amount for other operations', async () => {
    const ids = await fixture();
    const system = { kind: 'system', userId: null, sessionId: null };
    const admin = { kind: 'admin', userId: ids.userId, sessionId: ids.sessionId };
    await expect(insertFact(ids, { ...system, operation: 'payment_approval' })).rejects.toThrow(
      /registration_operation_audit_amount_ck/,
    );
    await expect(
      insertFact(ids, { ...admin, operation: 'cash_confirmation', amount: null }),
    ).rejects.toThrow(/registration_operation_audit_amount_ck/);
    await expect(
      insertFact(ids, {
        kind: 'public',
        userId: null,
        sessionId: null,
        operation: 'online_registration',
        amount: 100,
      }),
    ).rejects.toThrow(/registration_operation_audit_amount_ck/);
    await expect(
      insertFact(ids, { ...admin, operation: 'cash_confirmation', amount: 100 }),
    ).resolves.toHaveLength(1);
    await expect(insertFact(ids, { ...system, operation: 'refund' })).rejects.toThrow(
      /registration_operation_audit_operation_type_check/,
    );
  });

  it('keeps public and system facts immutable', async () => {
    const ids = await fixture();
    const [publicFact] = await insertFact(ids, {
      kind: 'public',
      userId: null,
      sessionId: null,
      operation: 'online_registration',
    });
    await expect(
      client`UPDATE registration_operation_audit SET actor_kind = 'system' WHERE id = ${publicFact.id}`,
    ).rejects.toThrow(/immutable/);
    await expect(
      client`DELETE FROM registration_operation_audit WHERE id = ${publicFact.id}`,
    ).rejects.toThrow(/immutable/);
    expect(await client`SELECT id FROM registration_operation_audit`).toHaveLength(1);
  });

  it('backfills facts written before the actor kind existed as admin facts', async () => {
    // Rebuild the schema up to 0015 only, write a legacy fact, then apply the rest.
    const journal = JSON.parse(
      readFileSync(join(migrationsFolder, 'meta/_journal.json'), 'utf8'),
    ) as { entries: { idx: number; tag: string }[] };
    const partial = mkdtempSync(join(tmpdir(), 'nb-migrations-'));
    try {
      mkdirSync(join(partial, 'meta'));
      const entries = journal.entries.filter((entry) => entry.idx <= 15);
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
    const ids = await fixture();
    const [legacy] = await client<{ id: string }[]>`
      INSERT INTO registration_operation_audit (operation_type, actor_user_id, session_id, event_id,
        registration_id, participant_id, before_state, after_state)
      VALUES ('manual_registration', ${ids.userId}, ${ids.sessionId}, ${ids.eventId},
        ${ids.registrationId}, ${ids.participantId}, '{}'::jsonb, '{}'::jsonb) RETURNING id`;
    await migrate(drizzle(client), { migrationsFolder });
    const [row] = await client<{ actor_kind: string; actor_user_id: string; session_id: string }[]>`
      SELECT actor_kind, actor_user_id, session_id FROM registration_operation_audit WHERE id = ${legacy.id}`;
    expect(row).toEqual({
      actor_kind: 'admin',
      actor_user_id: ids.userId,
      session_id: ids.sessionId,
    });
    const [{ column_default }] = await client<{ column_default: string | null }[]>`
      SELECT column_default FROM information_schema.columns
      WHERE table_name = 'registration_operation_audit' AND column_name = 'actor_kind'`;
    expect(column_default).toBeNull();
  });
});
