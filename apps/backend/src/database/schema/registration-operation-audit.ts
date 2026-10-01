import { sql } from 'drizzle-orm';
import { check, integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { authSessions } from './auth';
import { events } from './events';
import { participants } from './participants';
import { eventRegistrations } from './registrations';
import { users } from './users';

export const registrationOperationAudit = pgTable(
  'registration_operation_audit',
  {
    id: uuid('id').defaultRandom().primaryKey(),
    operationType: text('operation_type').notNull(),
    outcome: text('outcome').notNull().default('accepted'),
    actorUserId: uuid('actor_user_id')
      .notNull()
      .references(() => users.id),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => authSessions.id),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id),
    registrationId: uuid('registration_id')
      .notNull()
      .references(() => eventRegistrations.id),
    participantId: uuid('participant_id')
      .notNull()
      .references(() => participants.id),
    affectedActivityIds: uuid('affected_activity_ids')
      .array()
      .notNull()
      .default(sql`'{}'::uuid[]`),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    amountCents: integer('amount_cents'),
    reference: text('reference'),
    note: text('note'),
    receipt: text('receipt'),
    beforeState: jsonb('before_state').notNull(),
    afterState: jsonb('after_state').notNull(),
    facts: jsonb('facts').notNull().default({}),
  },
  (table) => [
    check(
      'registration_operation_audit_operation_type_check',
      sql`${table.operationType} IN ('manual_registration', 'cash_confirmation')`,
    ),
    check('registration_operation_audit_outcome_check', sql`${table.outcome} = 'accepted'`),
    check(
      'registration_operation_audit_amount_cents_check',
      sql`${table.amountCents} IS NULL OR ${table.amountCents} > 0`,
    ),
    check(
      'registration_operation_audit_amount_ck',
      sql`(${table.operationType} = 'cash_confirmation') = (${table.amountCents} IS NOT NULL)`,
    ),
  ],
);
