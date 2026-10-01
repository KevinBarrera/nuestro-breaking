import { foreignKey, pgTable, primaryKey, unique, uuid, timestamp } from 'drizzle-orm/pg-core';
import { authSessions } from './auth';
import { eventActivityRegistrations, eventRegistrations } from './registrations';
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
    unique('event_check_ins_scope_uq').on(table.eventId, table.eventRegistrationId, table.id),
    foreignKey({
      columns: [table.eventId, table.eventRegistrationId],
      foreignColumns: [eventRegistrations.eventId, eventRegistrations.id],
      name: 'event_check_ins_registration_scope_fk',
    }).onDelete('no action'),
  ],
);

export const activityCheckIns = pgTable(
  'activity_check_ins',
  {
    id: uuid('id').defaultRandom().notNull(),
    eventId: uuid('event_id').notNull(),
    eventRegistrationId: uuid('event_registration_id').notNull(),
    activityId: uuid('activity_id').notNull(),
    enrollmentId: uuid('enrollment_id').notNull(),
    eventCheckInId: uuid('event_check_in_id').notNull(),
    actorUserId: uuid('actor_user_id')
      .notNull()
      .references(() => users.id),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => authSessions.id),
    checkedInAt: timestamp('checked_in_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.id], name: 'activity_check_ins_pk' }),
    unique('activity_check_ins_registration_activity_uq').on(
      table.eventRegistrationId,
      table.activityId,
    ),
    foreignKey({
      columns: [table.eventId, table.eventRegistrationId, table.activityId, table.enrollmentId],
      foreignColumns: [
        eventActivityRegistrations.eventId,
        eventActivityRegistrations.eventRegistrationId,
        eventActivityRegistrations.activityId,
        eventActivityRegistrations.id,
      ],
      name: 'activity_check_ins_enrollment_fk',
    }).onDelete('no action'),
    foreignKey({
      columns: [table.eventId, table.eventRegistrationId, table.eventCheckInId],
      foreignColumns: [eventCheckIns.eventId, eventCheckIns.eventRegistrationId, eventCheckIns.id],
      name: 'activity_check_ins_event_check_in_fk',
    }).onDelete('no action'),
  ],
);
