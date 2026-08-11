import { foreignKey, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from './users';
import { venues } from './venues';

export const events = pgTable(
  'events',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    organizationId: uuid('organization_id').notNull(),
    organizerUserId: uuid('organizer_user_id')
      .notNull()
      .references(() => users.id),
    venueId: uuid('venue_id').notNull(),
    name: text('name').notNull(),
    lifecycle: text('lifecycle').notNull().default('draft'),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    endsAt: timestamp('ends_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    foreignKey({
      columns: [table.organizationId, table.venueId],
      foreignColumns: [venues.organizationId, venues.id],
      name: 'events_organization_venue_fk',
    }),
  ],
);
