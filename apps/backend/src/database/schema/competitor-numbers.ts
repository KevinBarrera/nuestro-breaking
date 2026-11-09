import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  integer,
  pgTable,
  primaryKey,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { activities } from './activities';
import { eventRegistrations } from './registrations';

// Competitor numbers (#377, migration 0040): one per registration and competition. Each
// competition numbers its competitors on its own, as `MAX + 1` under a per-competition advisory
// lock, so a number is never reused and gaps are expected. Rows are never deleted: a number is
// kept when the registration loses access, and an admin change retires it by replacing the value.
export const eventCompetitorNumbers = pgTable(
  'event_competitor_numbers',
  {
    eventId: uuid('event_id').notNull(),
    eventRegistrationId: uuid('event_registration_id').notNull(),
    // Always an activity of kind `competition` (checked by the writer, not by PostgreSQL).
    activityId: uuid('activity_id').notNull(),
    competitorNumber: integer('competitor_number').notNull(),
    assignedAt: timestamp('assigned_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.eventRegistrationId, table.activityId],
      name: 'event_competitor_numbers_pk',
    }),
    unique('event_competitor_numbers_activity_number_uq').on(
      table.activityId,
      table.competitorNumber,
    ),
    check('event_competitor_numbers_number_ck', sql`${table.competitorNumber} > 0`),
    foreignKey({
      columns: [table.eventId, table.eventRegistrationId],
      foreignColumns: [eventRegistrations.eventId, eventRegistrations.id],
      name: 'event_competitor_numbers_registration_fk',
    }).onDelete('no action'),
    foreignKey({
      columns: [table.eventId, table.activityId],
      foreignColumns: [activities.eventId, activities.id],
      name: 'event_competitor_numbers_activity_fk',
    }).onDelete('no action'),
  ],
);
