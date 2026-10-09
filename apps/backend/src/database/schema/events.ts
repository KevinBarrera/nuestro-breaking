import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  foreignKey,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { organizations } from './organizations';

export const events = pgTable(
  'events',
  {
    id: uuid('id').defaultRandom().notNull(),
    organizationId: uuid('organization_id').notNull(),
    name: text('name').notNull(),
    timeZone: text('time_zone').notNull(),
    startsAt: timestamp('starts_at', { withTimezone: true }),
    endsAt: timestamp('ends_at', { withTimezone: true }),
    // Set by migration or seed; not editable from the admin API, so shared links stay stable.
    slug: text('slug')
      .notNull()
      .default(sql`('event-' || replace(gen_random_uuid()::text, '-', ''))`),
    // Prefix of the registration folio (`LMP-7K3Q`). Existing events and inserts without one get `EV`.
    folioPrefix: text('folio_prefix').notNull().default('EV'),
    salesEnabled: boolean('sales_enabled').default(false).notNull(),
    salesOpensAt: timestamp('sales_opens_at', { withTimezone: true }),
    salesClosesAt: timestamp('sales_closes_at', { withTimezone: true }),
  },
  (table) => [
    primaryKey({ columns: [table.id], name: 'events_pk' }),
    unique('events_organization_id_id_uq').on(table.organizationId, table.id),
    foreignKey({
      columns: [table.organizationId],
      foreignColumns: [organizations.id],
      name: 'events_organization_id_organizations_id_fk',
    }).onDelete('no action'),
    unique('events_slug_uq').on(table.slug),
    check(
      'events_slug_ck',
      sql`length(${table.slug}) <= 80 AND ${table.slug} ~ '^[a-z0-9]+(-[a-z0-9]+)*$'`,
    ),
    check('events_folio_prefix_ck', sql`${table.folioPrefix} ~ '^[A-Z][A-Z0-9]{1,5}$'`),
    check(
      'events_sales_window_ck',
      sql`${table.salesOpensAt} IS NULL OR ${table.salesClosesAt} IS NULL OR ${table.salesOpensAt} < ${table.salesClosesAt}`,
    ),
    check('events_name_ck', sql`length(btrim(${table.name})) > 0`),
    check(
      'events_window_ck',
      sql`(
        (${table.startsAt} IS NULL AND ${table.endsAt} IS NULL)
        OR (
          ${table.startsAt} IS NOT NULL
          AND ${table.endsAt} IS NOT NULL
          AND ${table.startsAt} < ${table.endsAt}
        )
      )`,
    ),
  ],
);
