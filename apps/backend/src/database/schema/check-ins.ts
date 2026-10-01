import { foreignKey, pgTable, primaryKey, unique, uuid, timestamp } from 'drizzle-orm/pg-core';
import { authSessions } from './auth';
import { eventRegistrations } from './registrations';
import { users } from './users';

export const eventCheckIns = pgTable(
  'event_check_ins',
  {
    id: uuid('id').defaultRandom().notNull(),
    eventId: uuid('event_id').notNull(),
    eventRegistrationId: uuid('event_registration_id').notNull(),
    actorUserId: uuid('actor_user_id')
      .notNull()
      .references(() => users.id),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => authSessions.id),
    checkedInAt: timestamp('checked_in_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.id], name: 'event_check_ins_pk' }),
    unique('event_check_ins_registration_uq').on(table.eventRegistrationId),
    foreignKey({
      columns: [table.eventId, table.eventRegistrationId],
      foreignColumns: [eventRegistrations.eventId, eventRegistrations.id],
      name: 'event_check_ins_registration_scope_fk',
    }).onDelete('no action'),
  ],
);
