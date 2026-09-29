import { sql } from 'drizzle-orm';
import { check, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const participants = pgTable(
  'participants',
  {
    id: uuid('id').defaultRandom().notNull(),
    fullName: text('full_name').notNull(),
    email: text('email'),
    stageName: text('stage_name'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.id], name: 'participants_pk' }),
    check('participants_full_name_ck', sql`length(btrim(${table.fullName})) > 0`),
  ],
);
