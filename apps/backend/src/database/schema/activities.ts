import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { eventVenues } from './event-venues';

/**
 * The closed list of activity kinds (#249, migration 0031); `activities_kind_ck` allows exactly
 * these. The admin shows them with Spanish labels, but the stored code is always one of these.
 */
export const ACTIVITY_KINDS = ['battle', 'competition', 'workshop', 'social'] as const;
export type ActivityKind = (typeof ACTIVITY_KINDS)[number];

const activityKindList = sql.raw(ACTIVITY_KINDS.map((kind) => `'${kind}'`).join(', '));

export const activities = pgTable(
  'activities',
  {
    id: uuid('id').defaultRandom().notNull(),
    eventId: uuid('event_id').notNull(),
    venueId: uuid('venue_id').notNull(),
    kind: text('kind', { enum: ACTIVITY_KINDS }).notNull(),
    name: text('name').notNull(),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
    status: text('status').notNull().default('active'),
    version: integer('version').notNull().default(1),
  },
  (table) => [
    primaryKey({ columns: [table.id], name: 'activities_pk' }),
    unique('activities_event_id_id_uq').on(table.eventId, table.id),
    foreignKey({
      columns: [table.eventId, table.venueId],
      foreignColumns: [eventVenues.eventId, eventVenues.venueId],
      name: 'activities_event_venue_fk',
    })
      .onDelete('no action')
      .onUpdate('no action'),
    check('activities_kind_ck', sql`${table.kind} IN (${activityKindList})`),
    check('activities_name_ck', sql`length(btrim(${table.name})) > 0`),
    check('activities_window_ck', sql`${table.startsAt} < ${table.endsAt}`),
    check('activities_status_ck', sql`${table.status} IN ('active', 'archived')`),
    check('activities_version_ck', sql`${table.version} > 0`),
  ],
);
