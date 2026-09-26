import { sql } from 'drizzle-orm';
import { check, foreignKey, pgTable, primaryKey, text, unique, uuid } from 'drizzle-orm/pg-core';
import { organizations } from './organizations';

export const venues = pgTable(
  'venues',
  {
    id: uuid('id').defaultRandom().notNull(),
    organizationId: uuid('organization_id').notNull(),
    name: text('name').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.id], name: 'venues_pk' }),
    unique('venues_organization_id_id_uq').on(table.organizationId, table.id),
    foreignKey({
      columns: [table.organizationId],
      foreignColumns: [organizations.id],
      name: 'venues_organization_id_organizations_id_fk',
    }).onDelete('no action'),
    check('venues_name_ck', sql`length(btrim(${table.name})) > 0`),
  ],
);
