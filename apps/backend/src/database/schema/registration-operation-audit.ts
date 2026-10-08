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
    // `admin` facts carry a user and session; `public` and `system` facts carry neither (#174 D4).
    actorKind: text('actor_kind').notNull(),
    actorUserId: uuid('actor_user_id').references(() => users.id),
    sessionId: uuid('session_id').references(() => authSessions.id),
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
      sql`${table.operationType} IN ('manual_registration', 'cash_confirmation', 'pass_assignment', 'pass_selection_change', 'online_registration', 'payment_approval')`,
    ),
    check(
      'registration_operation_audit_actor_kind_check',
      sql`${table.actorKind} IN ('admin', 'public', 'system')`,
    ),
    check(
      'registration_operation_audit_actor_ck',
      sql`CASE WHEN ${table.actorKind} = 'admin' THEN ${table.actorUserId} IS NOT NULL AND ${table.sessionId} IS NOT NULL ELSE ${table.actorUserId} IS NULL AND ${table.sessionId} IS NULL END`,
    ),
    check('registration_operation_audit_outcome_check', sql`${table.outcome} = 'accepted'`),
    check(
      'registration_operation_audit_amount_cents_check',
      sql`${table.amountCents} IS NULL OR ${table.amountCents} > 0`,
    ),
    check(
      'registration_operation_audit_amount_ck',
      sql`(${table.operationType} IN ('cash_confirmation', 'payment_approval')) = (${table.amountCents} IS NOT NULL)`,
    ),
  ],
);
