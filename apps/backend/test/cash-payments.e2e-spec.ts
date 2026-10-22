import { createHash, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { drizzle } from 'drizzle-orm/postgres-js';
import { readMigrationFiles } from 'drizzle-orm/migrator';
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

const migrationsFolder = resolve(__dirname, '../drizzle');
const journal = JSON.parse(
  readFileSync(resolve(migrationsFolder, 'meta/_journal.json'), 'utf8'),
) as { entries: { tag: string }[] };

describe('event cash payments (e2e)', () => {
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
      INSERT INTO events (organization_id, name, time_zone)
      VALUES (${org}, 'One', 'Etc/UTC'), (${org}, 'Two', 'Etc/UTC') RETURNING id`;
    return { event: event.id, other: other.id };
  }
  async function session(eventId: string) {
    const [{ id: userId }] = await client<
      { id: string }[]
    >`INSERT INTO users (email, display_name, active) VALUES (${randomBytes(8).toString('hex') + '@example.com'}, 'Operator', true) RETURNING id`;
    await client`INSERT INTO user_roles (user_id, role, scope_type, scope_id) VALUES (${userId}, 'admin', 'event', ${eventId})`;
    const token = randomBytes(32).toString('hex');
    const [{ id: sessionId }] = await client<
      { id: string }[]
    >`INSERT INTO auth_sessions (user_id, token_digest, expires_at) VALUES (${userId}, ${createHash('sha256').update(token).digest('hex')}, now() + interval '1 hour') RETURNING id`;
    return { cookie: `nb_admin_session=${token}`, userId, sessionId };
  }
  const trustedOrigin = readTrustedOrigin(process.env);
  const headers = (cookie: string) => ({
    Cookie: cookie,
    Origin: trustedOrigin,
    'X-CSRF-Token': createHash('sha256')
      .update(`nb-admin-csrf-v1:${cookie.slice('nb_admin_session='.length)}`)
      .digest('hex'),
  });
  const cash = (event: string, id: string) =>
    request(app.getHttpServer()).post(
      `/admin/events/${event}/registrations/${id}/cash-confirmation`,
    );
  async function registration(event: string, status = 'pending_payment') {
    const [{ id }] = await client<{ id: string }[]>`
      WITH participant AS (INSERT INTO participants (full_name) VALUES ('Guest') RETURNING id)
      INSERT INTO event_registrations (event_id, participant_id, status, confirmation_source, confirmed_at)
      SELECT ${event}, id, ${status}, ${status === 'confirmed' ? 'admin_cash' : null},
        CASE WHEN ${status} = 'confirmed' THEN now() END FROM participant RETURNING id`;
    return id;
  }
  const payments = () =>
    client`SELECT event_id, event_registration_id, amount_cents, receipt FROM event_cash_payments
      ORDER BY receipt NULLS FIRST, amount_cents`;

  it('writes the cash payment row with the confirmation, beside the unchanged audit fact', async () => {
    const { event } = await fixture();
    const { cookie } = await session(event);
    const id = await registration(event);
    const result = await cash(event, id)
      .set(headers(cookie))
      .send({ amount: 1250, reference: 'R-1', note: 'Paid', receipt: ' A-17 ' })
      .expect(201);
    expect(await payments()).toEqual([
      { event_id: event, event_registration_id: id, amount_cents: 1250, receipt: 'A-17' },
    ]);
    expect(
      await client`SELECT amount_cents, reference, note, receipt FROM registration_operation_audit WHERE id = ${(result.body as { auditId: string }).auditId}`,
    ).toEqual([{ amount_cents: 1250, reference: 'R-1', note: 'Paid', receipt: 'A-17' }]);
  });

  it('writes nothing when the confirmation fails after the payment row', async () => {
    const { event } = await fixture();
    const { cookie } = await session(event);
    const id = await registration(event);
    await client`ALTER TABLE registration_operation_audit ADD CONSTRAINT reject_cash_test CHECK (operation_type <> 'cash_confirmation') NOT VALID`;
    await cash(event, id).set(headers(cookie)).send({ amount: 100, receipt: 'R-1' }).expect(500);
    expect(await payments()).toEqual([]);
    expect(await client`SELECT status FROM event_registrations WHERE id = ${id}`).toEqual([
      { status: 'pending_payment' },
    ]);
  });

  it('takes receipt uniqueness from the payment table, not from historical audit facts', async () => {
    const { event } = await fixture();
    const { cookie } = await session(event);
    const [first, second, third] = [
      await registration(event),
      await registration(event),
      await registration(event),
    ];
    await cash(event, first).set(headers(cookie)).send({ amount: 100, receipt: 'OLD' }).expect(201);
    // A later correction moves the current receipt; the audit keeps `OLD` as history.
    await client`UPDATE event_cash_payments SET receipt = 'NEW' WHERE event_registration_id = ${first}`;
    await cash(event, second)
      .set(headers(cookie))
      .send({ amount: 100, receipt: 'OLD' })
      .expect(201);

    // A receipt held only by a payment row, with no audit fact, is taken.
    const taken = await cash(event, third)
      .set(headers(cookie))
      .send({ amount: 100, receipt: 'NEW' })
      .expect(409);
    expect(taken.body).toEqual({
      statusCode: 409,
      code: 'receipt_taken',
      message: 'Receipt number already used in this event',
    });
    expect(await client`SELECT status, folio FROM event_registrations WHERE id = ${third}`).toEqual(
      [{ status: 'pending_payment', folio: null }],
    );
    expect(
      await client`SELECT count(*)::int AS n FROM registration_operation_audit WHERE registration_id = ${third} AND operation_type = 'cash_confirmation'`,
    ).toEqual([{ n: 0 }]);
  });

  it('lets exactly one of two concurrent confirmations take a receipt', async () => {
    const { event } = await fixture();
    const { cookie } = await session(event);
    const ids = [await registration(event), await registration(event)];
    const statuses = (
      await Promise.all(
        ids.map((id) =>
          cash(event, id).set(headers(cookie)).send({ amount: 100, receipt: 'SAME' }),
        ),
      )
    )
      .map((response) => response.status)
      .sort();
    expect(statuses).toEqual([201, 409]);
    expect(
      await client`SELECT count(*)::int AS n FROM event_cash_payments WHERE receipt = 'SAME'`,
    ).toEqual([{ n: 1 }]);
  });

  it('enforces the payment row rules in PostgreSQL', async () => {
    const { event, other } = await fixture();
    const [a, b, c, d, foreign] = [
      await registration(event, 'confirmed'),
      await registration(event, 'confirmed'),
      await registration(event, 'confirmed'),
      await registration(event, 'confirmed'),
      await registration(other, 'confirmed'),
    ];
    const insert = (eventId: string, id: string, amount: number, receipt: string | null) =>
      client`INSERT INTO event_cash_payments (event_id, event_registration_id, amount_cents, receipt)
        VALUES (${eventId}, ${id}, ${amount}, ${receipt})`;
    await insert(event, a, 100, 'A-17');
    // Exact comparison: another case is a different receipt; another event may reuse it.
    await insert(event, b, 100, 'a-17');
    await insert(other, foreign, 100, 'A-17');
    await expect(insert(event, c, 100, 'A-17')).rejects.toMatchObject({
      code: '23505',
      constraint_name: 'event_cash_payments_event_receipt_uq',
    });
    // Legacy confirmations without a receipt may coexist.
    await insert(event, c, 100, null);
    await insert(event, d, 100, null);
    // One cash payment per registration.
    await expect(insert(event, a, 200, 'A-18')).rejects.toMatchObject({
      code: '23505',
      constraint_name: 'event_cash_payments_registration_uq',
    });
    const e = await registration(event, 'confirmed');
    await expect(insert(event, e, 0, 'Z-1')).rejects.toMatchObject({ code: '23514' });
    await expect(insert(event, e, 100, '')).rejects.toMatchObject({ code: '23514' });
    await expect(insert(event, e, 100, 'x'.repeat(51))).rejects.toMatchObject({ code: '23514' });
    await insert(event, e, 100, 'x'.repeat(50));
    // A registration of another event never belongs to this event's payments.
    const f = await registration(other, 'confirmed');
    await expect(insert(event, f, 100, 'Z-2')).rejects.toMatchObject({ code: '23503' });
    expect(await payments()).toHaveLength(6);
  });

  it('migration 0036 backfills one payment row per cash confirmation and frees audit receipts', async () => {
    const tag = '0036_event_cash_payments';
    const index = journal.entries.findIndex((entry) => entry.tag === tag);
    expect(index).toBe(journal.entries.length - 1);
    const migrations = readMigrationFiles({ migrationsFolder });
    const run = async (from: number, to: number) => {
      for (const migration of migrations.slice(from, to))
        for (const statement of migration.sql) await client.unsafe(statement);
    };
    // Rebuild the schema as it stood before 0036, then add legacy data and apply 0036 alone.
    await client.unsafe('DROP SCHEMA public CASCADE');
    await client.unsafe('DROP SCHEMA drizzle CASCADE');
    await client.unsafe('CREATE SCHEMA public');
    try {
      await run(0, index);
      const { event, other } = await fixture();
      const { userId, sessionId } = await session(event);
      const fact = async (
        eventId: string,
        id: string,
        operation: string,
        amount: number | null,
        receipt: string | null,
      ) => {
        const [{ participant_id: participantId }] = await client<{ participant_id: string }[]>`
          SELECT participant_id FROM event_registrations WHERE id = ${id}`;
        await client`
          INSERT INTO registration_operation_audit (operation_type, actor_kind, actor_user_id,
            session_id, event_id, registration_id, participant_id, amount_cents, receipt,
            before_state, after_state, created_at)
          VALUES (${operation}, 'admin', ${userId}, ${sessionId}, ${eventId}, ${id},
            ${participantId}, ${amount}, ${receipt}, '{}', '{}', '2026-09-01T10:00:00Z')`;
      };
      const [withReceipt, legacyOne, legacyTwo, complimentary, foreign] = [
        await registration(event, 'confirmed'),
        await registration(event, 'confirmed'),
        await registration(event, 'confirmed'),
        await registration(event, 'confirmed'),
        await registration(other, 'confirmed'),
      ];
      await fact(event, withReceipt, 'cash_confirmation', 1250, 'A-17');
      await fact(event, legacyOne, 'cash_confirmation', 100, null);
      await fact(event, legacyTwo, 'cash_confirmation', 200, null);
      await fact(event, complimentary, 'complimentary_confirmation', null, null);
      await fact(other, foreign, 'cash_confirmation', 300, 'A-17');

      await run(index, index + 1);

      // Timestamps come from the confirmation fact.
      expect(
        await client`SELECT event_id, event_registration_id, amount_cents, receipt,
            created_at = timestamptz '2026-09-01 10:00:00+00' AND updated_at = created_at AS from_fact
          FROM event_cash_payments ORDER BY amount_cents`,
      ).toEqual(
        [
          [event, legacyOne, 100, null],
          [event, legacyTwo, 200, null],
          [other, foreign, 300, 'A-17'],
          [event, withReceipt, 1250, 'A-17'],
        ].map(([eventId, id, amount, receipt]) => ({
          event_id: eventId,
          event_registration_id: id,
          amount_cents: amount,
          receipt,
          from_fact: true,
        })),
      );
      expect(
        await client`SELECT to_regclass('public.registration_operation_audit_cash_receipt_uq') AS idx`,
      ).toEqual([{ idx: null }]);
      // The audit no longer reserves receipts: a later fact may repeat a historical one.
      const again = await registration(event, 'confirmed');
      await fact(event, again, 'cash_confirmation', 100, 'A-17');
    } finally {
      await client.unsafe('CREATE SCHEMA IF NOT EXISTS drizzle');
    }
  });
});
