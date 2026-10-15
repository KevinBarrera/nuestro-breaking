// Fake Mercado Pago settings first: the payments module validates them when AppModule boots.
import './e2e-env';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { hash, argon2id } from 'argon2';
import { drizzle } from 'drizzle-orm/postgres-js';
import { type Sql } from 'postgres';
import { AppModule } from '@/app.module';
import { DATABASE_CLIENT } from '@/database/database.constants';
import * as schema from '@/database/schema';
import { DatabaseService } from '@/database/database.service';
import { PostgresHarness } from './postgres-harness';

// Test-only child process: IPC is local to Playwright, never an HTTP fixture endpoint.
const harness = new PostgresHarness();
let app: INestApplication | undefined;
let client: Sql | undefined;
let closing = false;
const starting = main();

async function stop() {
  if (closing) return;
  closing = true;
  // A disconnect during container startup must not leave a newly started container behind.
  await starting?.catch(() => undefined);
  try {
    await app?.close();
  } finally {
    await harness.stop();
  }
}

function shutdown() {
  void stop().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}
process.on('disconnect', shutdown);
process.on('SIGTERM', shutdown);

async function main() {
  client = await harness.start();
  const password = 'disposable-password';
  const [{ id: org }] = await client<{ id: string }[]>`
    INSERT INTO organizations (name) VALUES ('Disposable org') RETURNING id`;
  const [eventRow, otherEventRow] = await client<{ id: string }[]>`
    INSERT INTO events (organization_id, name, time_zone)
    VALUES (${org}, 'Live event', 'Etc/UTC'),
      (${org}, 'Other event', 'Etc/UTC') RETURNING id`;
  const event = eventRow.id;
  const otherEvent = otherEventRow.id;
  const [{ id: user }] = await client<{ id: string }[]>`
    INSERT INTO users (email, display_name, active, password_hash)
    VALUES ('live@example.test', 'Live operator', true, ${await hash(password, { type: argon2id })})
    RETURNING id`;
  await client`INSERT INTO user_roles (user_id, role, scope_type, scope_id)
    VALUES (${user}, 'admin', 'event', ${event})`;
  const [allowed, forbidden] = await client<{ id: string }[]>`
    INSERT INTO participants (full_name) VALUES ('Allowed Guest'), ('Denied Guest') RETURNING id`;
  const [registration, deniedRegistration] = await client<{ id: string }[]>`
    INSERT INTO event_registrations (event_id, participant_id, status, confirmation_source, confirmed_at)
    VALUES (${event}, ${allowed.id}, 'confirmed', 'admin_cash', now()),
      (${otherEvent}, ${forbidden.id}, 'confirmed', 'admin_cash', now()) RETURNING id`;

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(DatabaseService)
    .useValue({ db: {} })
    .overrideProvider(DATABASE_CLIENT)
    .useValue(drizzle({ client, schema }))
    .compile();
  app = moduleRef.createNestApplication();
  app.enableCors({
    origin: process.env.AUTH_TRUSTED_ORIGIN,
    credentials: true,
    exposedHeaders: ['X-CSRF-Token'],
  });
  await app.init();
  await app.listen(Number(process.env.NB_LIVE_API_PORT), '127.0.0.1');
  if (process.connected)
    process.send?.({
      type: 'ready',
      event,
      otherEvent,
      registration: registration.id,
      deniedRegistration: deniedRegistration.id,
    });
  process.on('message', (message) => {
    if (message !== 'snapshot') return;
    void (async () => {
      const rows =
        await client!`SELECT event_registration_id FROM event_check_ins ORDER BY event_registration_id`;
      const registrations = await client!`
        SELECT id, status FROM event_registrations ORDER BY id`;
      process.send?.({ type: 'snapshot', rows, registrations });
    })().catch((error: unknown) => console.error(error));
  });
}

void starting.catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
  void stop().finally(() => process.disconnect?.());
});
