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

/** Delivery states of a confirmation email; the check constraint below allows exactly these. */
export const CONFIRMATION_EMAIL_STATUSES = ['pending', 'sent', 'failed'] as const;
export type ConfirmationEmailStatus = (typeof CONFIRMATION_EMAIL_STATUSES)[number];

// Transactional outbox for confirmation emails (#179 D2, D3, migration 0019). The webhook queues one
// row per registration in its confirmation transaction; `ConfirmationEmailDispatcher` claims it after
// commit, sends it and records the result. Only delivery state is kept: no addresses, names or
// message bodies (content is built when sending).
export const registrationConfirmationEmails = pgTable(
  'registration_confirmation_emails',
  {
    id: uuid('id').defaultRandom().notNull(),
    registrationId: uuid('registration_id').notNull(),
    status: text('status', { enum: CONFIRMATION_EMAIL_STATUSES }).default('pending').notNull(),
    attempts: integer('attempts').default(0).notNull(),
    nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true }).defaultNow().notNull(),
    // A short safe code such as `rate_limited`; never a provider message, address or body.
    lastErrorCode: text('last_error_code'),
    providerMessageId: text('provider_message_id'),
    sentAt: timestamp('sent_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.id], name: 'registration_confirmation_emails_pk' }),
    // One email per registration: the idempotency key for webhook retries and later approvals.
    unique('registration_confirmation_emails_registration_id_uq').on(table.registrationId),
    // The dispatcher claims due rows by status and time.
    index('registration_confirmation_emails_due_idx').on(table.status, table.nextAttemptAt),
    check(
      'registration_confirmation_emails_status_ck',
      sql`${table.status} IN ('pending', 'sent', 'failed')`,
    ),
    check('registration_confirmation_emails_attempts_ck', sql`${table.attempts} >= 0`),
    check(
      'registration_confirmation_emails_last_error_code_ck',
      sql`${table.lastErrorCode} IS NULL OR length(${table.lastErrorCode}) <= 64`,
    ),
    foreignKey({
      columns: [table.registrationId],
      foreignColumns: [eventRegistrations.id],
      name: 'registration_confirmation_emails_registration_fk',
    }).onDelete('no action'),
  ],
);
