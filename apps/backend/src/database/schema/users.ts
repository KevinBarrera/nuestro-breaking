import { sql } from 'drizzle-orm';
import { boolean, check, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

export const users = pgTable(
  'users',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    email: varchar('email', { length: 254 }).notNull().unique(),
    displayName: text('display_name'),
    active: boolean('active').notNull().default(true),
    passwordHash: text('password_hash'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    check(
      'users_password_hash_ck',
      sql`${table.passwordHash} IS NULL OR ${table.passwordHash} LIKE '$argon2id$%'`,
    ),
  ],
);
