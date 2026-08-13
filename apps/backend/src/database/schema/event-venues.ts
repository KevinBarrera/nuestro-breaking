import { foreignKey, pgTable, primaryKey, uuid } from 'drizzle-orm/pg-core';
import { events } from './events';
import { venues } from './venues';

export const eventVenues = pgTable(
  'event_venues',
  {
    organizationId: uuid('organization_id').notNull(),
    eventId: uuid('event_id').notNull(),
    venueId: uuid('venue_id').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.eventId, table.venueId], name: 'event_venues_pk' }),
    foreignKey({
      columns: [table.organizationId, table.eventId],
      foreignColumns: [events.organizationId, events.id],
      name: 'event_venues_event_scope_fk',
    })
      .onDelete('no action')
      .onUpdate('no action'),
    foreignKey({
      columns: [table.organizationId, table.venueId],
      foreignColumns: [venues.organizationId, venues.id],
      name: 'event_venues_venue_scope_fk',
    })
      .onDelete('no action')
      .onUpdate('no action'),
  ],
);
