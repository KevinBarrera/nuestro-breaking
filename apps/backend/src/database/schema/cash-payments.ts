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
import { eventRegistrations } from './registrations';

// The current amount and receipt of a cash-confirmed registration (#104, migration 0036). The
// `cash_confirmation` audit fact keeps the values as confirmed; this row holds the current ones.
export const eventCashPayments = pgTable(
  'event_cash_payments',
  {
    id: uuid('id').defaultRandom().notNull(),
    eventId: uuid('event_id').notNull(),
    eventRegistrationId: uuid('event_registration_id').notNull(),
    amountCents: integer('amount_cents').notNull(),
    // Paper receipt number, trimmed by the API; null on confirmations before #125.
    receipt: text('receipt'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.id], name: 'event_cash_payments_pk' }),
    unique('event_cash_payments_registration_uq').on(table.eventRegistrationId),
    // A receipt number is used once per event, compared exactly (#125).
    uniqueIndex('event_cash_payments_event_receipt_uq')
      .on(table.eventId, table.receipt)
      .where(sql`${table.receipt} IS NOT NULL`),
    foreignKey({
      columns: [table.eventId, table.eventRegistrationId],
      foreignColumns: [eventRegistrations.eventId, eventRegistrations.id],
      name: 'event_cash_payments_registration_scope_fk',
    }).onDelete('no action'),
    check('event_cash_payments_amount_cents_ck', sql`${table.amountCents} > 0`),
    check(
      'event_cash_payments_receipt_ck',
      sql`${table.receipt} IS NULL OR char_length(${table.receipt}) BETWEEN 1 AND 50`,
    ),
  ],
);
