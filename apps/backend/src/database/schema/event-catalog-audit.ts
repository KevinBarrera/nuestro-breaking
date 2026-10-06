import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { authSessions } from './auth';
import { events } from './events';
import { users } from './users';

// Append-only (immutability trigger in migration 0011); holds catalog state only, never personal data.
export const eventCatalogAudit = pgTable(
  'event_catalog_audit',
  {
    id: uuid('id').defaultRandom().notNull(),
    eventId: uuid('event_id').notNull(),
    actorUserId: uuid('actor_user_id')
      .notNull()
      .references(() => users.id),
    actorSessionId: uuid('actor_session_id')
      .notNull()
      .references(() => authSessions.id),
    entityType: text('entity_type').notNull(),
    entityId: uuid('entity_id').notNull(),
    operation: text('operation').notNull(),
    before: jsonb('before'),
    after: jsonb('after'),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.id], name: 'event_catalog_audit_pk' }),
    foreignKey({
      columns: [table.eventId],
      foreignColumns: [events.id],
      name: 'event_catalog_audit_event_fk',
    }).onDelete('no action'),
    check(
      'event_catalog_audit_entity_type_ck',
      sql`${table.entityType} IN ('activity', 'pass_type')`,
    ),
    check(
      'event_catalog_audit_operation_ck',
      sql`${table.operation} IN ('create', 'update', 'archive', 'access_change')`,
    ),
    check(
      'event_catalog_audit_state_ck',
      sql`(${table.operation} = 'create' AND ${table.before} IS NULL AND ${table.after} IS NOT NULL)
        OR (${table.operation} <> 'create' AND ${table.before} IS NOT NULL AND ${table.after} IS NOT NULL)`,
    ),
  ],
);
