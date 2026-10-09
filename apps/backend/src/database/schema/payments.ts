import { sql } from 'drizzle-orm';
import {
  check,
  foreignKey,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';
import { eventRegistrations } from './registrations';

// Mercado Pago Checkout Pro records (#177 D4, D5, migration 0018). Only provider ids, amounts and
// statuses are kept: no card data, payer data, headers, signatures or provider payloads.

// One row per Checkout Pro preference created for a registration.
export const registrationCheckouts = pgTable(
  'registration_checkouts',
  {
    id: uuid('id').defaultRandom().notNull(),
    registrationId: uuid('registration_id').notNull(),
    mode: text('mode').notNull(),
    preferenceId: text('preference_id').notNull(),
    amountCents: integer('amount_cents').notNull(),
    currency: text('currency').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.id], name: 'registration_checkouts_pk' }),
    unique('registration_checkouts_preference_id_uq').on(table.preferenceId),
    index('registration_checkouts_registration_idx').on(table.registrationId),
    check('registration_checkouts_mode_ck', sql`${table.mode} IN ('sandbox', 'production')`),
    check('registration_checkouts_amount_cents_ck', sql`${table.amountCents} > 0`),
    check('registration_checkouts_currency_ck', sql`${table.currency} = 'MXN'`),
    foreignKey({
      columns: [table.registrationId],
      foreignColumns: [eventRegistrations.id],
      name: 'registration_checkouts_registration_fk',
    }).onDelete('no action'),
  ],
);

// One row per Mercado Pago payment id; a preference can produce several (a rejected card, then a
// retry). `status` keeps Mercado Pago's own vocabulary.
export const registrationPayments = pgTable(
  'registration_payments',
  {
    id: uuid('id').defaultRandom().notNull(),
    checkoutId: uuid('checkout_id').notNull(),
    providerPaymentId: text('provider_payment_id').notNull(),
    status: text('status').notNull(),
    amountCents: integer('amount_cents').notNull(),
    currency: text('currency').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.id], name: 'registration_payments_pk' }),
    unique('registration_payments_provider_payment_id_uq').on(table.providerPaymentId),
    index('registration_payments_checkout_idx').on(table.checkoutId),
    check(
      'registration_payments_status_ck',
      sql`${table.status} IN ('pending', 'approved', 'authorized', 'in_process', 'in_mediation', 'rejected', 'cancelled', 'refunded', 'charged_back')`,
    ),
    check('registration_payments_amount_cents_ck', sql`${table.amountCents} > 0`),
    check('registration_payments_currency_ck', sql`${table.currency} = 'MXN'`),
    foreignKey({
      columns: [table.checkoutId],
      foreignColumns: [registrationCheckouts.id],
      name: 'registration_payments_checkout_fk',
    }).onDelete('no action'),
  ],
);

// Idempotency log: each webhook notification id is processed once. `outcome` is a short code.
export const paymentWebhookNotifications = pgTable(
  'payment_webhook_notifications',
  {
    id: uuid('id').defaultRandom().notNull(),
    notificationId: text('notification_id').notNull(),
    providerPaymentId: text('provider_payment_id').notNull(),
    receivedAt: timestamp('received_at', { withTimezone: true }).defaultNow().notNull(),
    processedAt: timestamp('processed_at', { withTimezone: true }),
    outcome: text('outcome'),
  },
  (table) => [
    primaryKey({ columns: [table.id], name: 'payment_webhook_notifications_pk' }),
    unique('payment_webhook_notifications_notification_id_uq').on(table.notificationId),
    check(
      'payment_webhook_notifications_outcome_ck',
      sql`${table.outcome} IS NULL OR length(${table.outcome}) <= 64`,
    ),
  ],
);
