import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  index,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { authSessions } from './auth';
import { users } from './users';

/** Event lifecycle actions; the check constraint below allows exactly these. */
export const EVENT_ADMIN_AUDIT_ACTIONS = [
  'created',
  'updated',
  'archived',
  'restored',
  'deleted',
] as const;
export type EventAdminAuditAction = (typeof EVENT_ADMIN_AUDIT_ACTIONS)[number];

// Event audit (#213 D4, migration 0021). Append-only: a trigger refuses UPDATE and DELETE.
// `eventId` has no foreign key and the row keeps the slug and name, so the `deleted` row outlives
// the event. Every action comes from an admin session.
export const eventAdminAudit = pgTable(
  'event_admin_audit',
  {
    id: uuid('id').defaultRandom().notNull(),
    eventId: uuid('event_id').notNull(),
    eventSlug: text('event_slug').notNull(),
    eventName: text('event_name').notNull(),
    action: text('action', { enum: EVENT_ADMIN_AUDIT_ACTIONS }).notNull(),
    actorUserId: uuid('actor_user_id').notNull(),
    actorSessionId: uuid('actor_session_id').notNull(),
    details: jsonb('details').default({}).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.id], name: 'event_admin_audit_pk' }),
    index('event_admin_audit_event_created_idx').on(table.eventId, table.createdAt),
    check(
      'event_admin_audit_action_ck',
      sql`${table.action} IN ('created', 'updated', 'archived', 'restored', 'deleted')`,
    ),
    foreignKey({
      columns: [table.actorUserId],
      foreignColumns: [users.id],
      name: 'event_admin_audit_actor_fk',
    }).onDelete('no action'),
    foreignKey({
      columns: [table.actorSessionId],
      foreignColumns: [authSessions.id],
      name: 'event_admin_audit_session_fk',
    }).onDelete('no action'),
  ],
);
