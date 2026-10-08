import { sql } from 'drizzle-orm';
import { check, date, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';

// `full_name` is the display name; the #58 profile parts are optional so admin manual registration
// can keep recording a single name. AKA is `stage_name`.
export const participants = pgTable(
  'participants',
  {
    id: uuid('id').defaultRandom().notNull(),
    fullName: text('full_name').notNull(),
    email: text('email'),
    phone: text('phone'),
    stageName: text('stage_name'),
    firstName: text('first_name'),
    firstLastName: text('first_last_name'),
    secondLastName: text('second_last_name'),
    city: text('city'),
    instagram: text('instagram'),
    level: text('level'),
    birthDate: date('birth_date', { mode: 'string' }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.id], name: 'participants_pk' }),
    check('participants_full_name_ck', sql`length(btrim(${table.fullName})) > 0`),
    check(
      'participants_phone_ck',
      sql`${table.phone} IS NULL OR length(btrim(${table.phone})) > 0`,
    ),
    check(
      'participants_first_name_ck',
      sql`${table.firstName} IS NULL OR (length(btrim(${table.firstName})) > 0 AND length(${table.firstName}) <= 100)`,
    ),
    check(
      'participants_first_last_name_ck',
      sql`${table.firstLastName} IS NULL OR (length(btrim(${table.firstLastName})) > 0 AND length(${table.firstLastName}) <= 100)`,
    ),
    check(
      'participants_second_last_name_ck',
      sql`${table.secondLastName} IS NULL OR (length(btrim(${table.secondLastName})) > 0 AND length(${table.secondLastName}) <= 100)`,
    ),
    check(
      'participants_name_parts_ck',
      sql`(${table.firstName} IS NULL) = (${table.firstLastName} IS NULL)`,
    ),
    check(
      'participants_city_ck',
      sql`${table.city} IS NULL OR (length(btrim(${table.city})) > 0 AND length(${table.city}) <= 100)`,
    ),
    check(
      'participants_instagram_ck',
      sql`${table.instagram} IS NULL OR (length(btrim(${table.instagram})) > 0 AND length(${table.instagram}) <= 64)`,
    ),
    check(
      'participants_level_ck',
      sql`${table.level} IS NULL OR (length(btrim(${table.level})) > 0 AND length(${table.level}) <= 50)`,
    ),
    check(
      'participants_birth_date_ck',
      sql`${table.birthDate} IS NULL OR ${table.birthDate} >= DATE '1900-01-01'`,
    ),
  ],
);
