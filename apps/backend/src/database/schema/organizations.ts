import { sql } from 'drizzle-orm';
import { check, pgTable, primaryKey, text, uuid } from 'drizzle-orm/pg-core';

export const organizations = pgTable(
  'organizations',
  {
    id: uuid('id').defaultRandom().notNull(),
    name: text('name').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.id], name: 'organizations_pk' }),
    check('organizations_name_ck', sql`length(btrim(${table.name})) > 0`),
  ],
);
