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
  },
  (table) => [
    primaryKey({ columns: [table.id], name: 'events_pk' }),
    unique('events_organization_id_id_uq').on(table.organizationId, table.id),
    foreignKey({
      columns: [table.organizationId],
      foreignColumns: [organizations.id],
      name: 'events_organization_id_organizations_id_fk',
    }).onDelete('no action'),
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
