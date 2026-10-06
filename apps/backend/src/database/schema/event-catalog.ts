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
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { activities } from './activities';
import { events } from './events';
import { eventRegistrations } from './registrations';

export const eventPassTypes = pgTable(
  'event_pass_types',
  {
    id: uuid('id').defaultRandom().notNull(),
    eventId: uuid('event_id').notNull(),
    name: text('name').notNull(),
    passClass: text('pass_class').notNull(),
    priceCents: integer('price_cents').notNull(),
    requiresPassClass: text('requires_pass_class'),
    status: text('status').notNull().default('active'),
    version: integer('version').notNull().default(1),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.id], name: 'event_pass_types_pk' }),
    unique('event_pass_types_event_id_id_uq').on(table.eventId, table.id),
    uniqueIndex('event_pass_types_event_active_name_uq')
      .on(table.eventId, sql`lower(btrim(${table.name}))`)
      .where(sql`${table.status} = 'active'`),
    foreignKey({
      columns: [table.eventId],
      foreignColumns: [events.id],
      name: 'event_pass_types_event_fk',
    }).onDelete('no action'),
    check('event_pass_types_name_ck', sql`length(btrim(${table.name})) > 0`),
    check(
      'event_pass_types_pass_class_ck',
      sql`${table.passClass} IN ('full', 'general', 'add_on')`,
    ),
    check('event_pass_types_price_cents_ck', sql`${table.priceCents} >= 0`),
    // Only an add-on may require holding a pass of another class (Open Styles requires full).
    check(
      'event_pass_types_requires_pass_class_ck',
      sql`${table.requiresPassClass} IS NULL OR (${table.passClass} = 'add_on' AND ${table.requiresPassClass} IN ('full', 'general'))`,
    ),
    check('event_pass_types_status_ck', sql`${table.status} IN ('active', 'archived')`),
    check('event_pass_types_version_ck', sql`${table.version} > 0`),
  ],
);

export const eventPassTypeActivities = pgTable(
  'event_pass_type_activities',
  {
    eventId: uuid('event_id').notNull(),
    passTypeId: uuid('pass_type_id').notNull(),
    activityId: uuid('activity_id').notNull(),
    access: text('access').notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.eventId, table.passTypeId, table.activityId],
      name: 'event_pass_type_activities_pk',
    }),
    foreignKey({
      columns: [table.eventId, table.passTypeId],
      foreignColumns: [eventPassTypes.eventId, eventPassTypes.id],
      name: 'event_pass_type_activities_pass_type_scope_fk',
    }).onDelete('no action'),
    foreignKey({
      columns: [table.eventId, table.activityId],
      foreignColumns: [activities.eventId, activities.id],
      name: 'event_pass_type_activities_activity_scope_fk',
    }).onDelete('no action'),
    check(
      'event_pass_type_activities_access_ck',
      sql`${table.access} IN ('selectable', 'included')`,
    ),
  ],
);

export const eventRegistrationPasses = pgTable(
  'event_registration_passes',
  {
    id: uuid('id').defaultRandom().notNull(),
    eventId: uuid('event_id').notNull(),
    eventRegistrationId: uuid('event_registration_id').notNull(),
    passTypeId: uuid('pass_type_id').notNull(),
    priceCents: integer('price_cents').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.id], name: 'event_registration_passes_pk' }),
    unique('event_registration_passes_event_id_id_uq').on(table.eventId, table.id),
    unique('event_registration_passes_registration_pass_type_uq').on(
      table.eventRegistrationId,
      table.passTypeId,
    ),
    foreignKey({
      columns: [table.eventId, table.eventRegistrationId],
      foreignColumns: [eventRegistrations.eventId, eventRegistrations.id],
      name: 'event_registration_passes_registration_scope_fk',
    }).onDelete('no action'),
    foreignKey({
      columns: [table.eventId, table.passTypeId],
      foreignColumns: [eventPassTypes.eventId, eventPassTypes.id],
      name: 'event_registration_passes_pass_type_scope_fk',
    }).onDelete('no action'),
    check('event_registration_passes_price_cents_ck', sql`${table.priceCents} >= 0`),
  ],
);

// Whether the activity is selectable for the purchased pass type is enforced by the entitlement service.
export const eventRegistrationPassSelections = pgTable(
  'event_registration_pass_selections',
  {
    eventId: uuid('event_id').notNull(),
    registrationPassId: uuid('registration_pass_id').notNull(),
    activityId: uuid('activity_id').notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.eventId, table.registrationPassId, table.activityId],
      name: 'event_registration_pass_selections_pk',
    }),
    foreignKey({
      columns: [table.eventId, table.registrationPassId],
      foreignColumns: [eventRegistrationPasses.eventId, eventRegistrationPasses.id],
      name: 'event_registration_pass_selections_registration_pass_scope_fk',
    }).onDelete('no action'),
    foreignKey({
      columns: [table.eventId, table.activityId],
      foreignColumns: [activities.eventId, activities.id],
      name: 'event_registration_pass_selections_activity_scope_fk',
    }).onDelete('no action'),
  ],
);
