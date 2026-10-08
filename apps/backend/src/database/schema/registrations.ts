import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { activities } from './activities';
import { events } from './events';
import { participants } from './participants';

export const eventRegistrations = pgTable(
  'event_registrations',
  {
    id: uuid('id').defaultRandom().notNull(),
    eventId: uuid('event_id').notNull(),
    participantId: uuid('participant_id').notNull(),
    folio: text('folio'),
    status: text('status').notNull().default('pending_payment'),
    confirmationSource: text('confirmation_source'),
    confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.id], name: 'event_registrations_pk' }),
    unique('event_registrations_event_id_id_uq').on(table.eventId, table.id),
    unique('event_registrations_event_participant_uq').on(table.eventId, table.participantId),
    unique('event_registrations_event_folio_uq').on(table.eventId, table.folio),
    check(
      'event_registrations_status_ck',
      sql`${table.status} IN ('pending_payment', 'confirmed', 'voided')`,
    ),
    check(
      'event_registrations_confirmation_source_ck',
      sql`${table.confirmationSource} IS NULL OR ${table.confirmationSource} IN ('approved_payment', 'admin_cash')`,
    ),
    check(
      'event_registrations_confirmation_metadata_ck',
      sql`(${table.status} = 'confirmed' AND ${table.confirmationSource} IS NOT NULL AND ${table.confirmedAt} IS NOT NULL)
        OR (${table.status} IN ('pending_payment', 'voided') AND ${table.confirmationSource} IS NULL AND ${table.confirmedAt} IS NULL)`,
    ),
    foreignKey({
      columns: [table.eventId],
      foreignColumns: [events.id],
      name: 'event_registrations_event_fk',
    }).onDelete('no action'),
    foreignKey({
      columns: [table.participantId],
      foreignColumns: [participants.id],
      name: 'event_registrations_participant_fk',
    }).onDelete('no action'),
  ],
);

export const eventActivityRegistrations = pgTable(
  'event_activity_registrations',
  {
    id: uuid('id').defaultRandom().notNull(),
    eventId: uuid('event_id').notNull(),
    eventRegistrationId: uuid('event_registration_id').notNull(),
    activityId: uuid('activity_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.id], name: 'event_activity_registrations_pk' }),
    unique('event_activity_registrations_registration_activity_uq').on(
      table.eventRegistrationId,
      table.activityId,
    ),
    unique('event_activity_registrations_check_in_scope_uq').on(
      table.eventId,
      table.eventRegistrationId,
      table.activityId,
      table.id,
    ),
    foreignKey({
      columns: [table.eventId, table.eventRegistrationId],
      foreignColumns: [eventRegistrations.eventId, eventRegistrations.id],
      name: 'event_activity_registrations_registration_scope_fk',
    })
      .onDelete('no action')
      .onUpdate('no action'),
    foreignKey({
      columns: [table.eventId, table.activityId],
      foreignColumns: [activities.eventId, activities.id],
      name: 'event_activity_registrations_activity_scope_fk',
    })
      .onDelete('no action')
      .onUpdate('no action'),
  ],
);
