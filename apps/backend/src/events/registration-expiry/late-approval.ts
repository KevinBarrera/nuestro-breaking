import { and, eq, ne, sql } from 'drizzle-orm';
import { alias, type AnyPgColumn } from 'drizzle-orm/pg-core';
import {
  eventRegistrations,
  events,
  participants,
  registrationOperationAudit,
} from '@/database/schema';
import { phoneMatchKeySql } from '@/events/participant-profile/participant-match-sql';
import type { RegistrationTransaction } from '@/events/registration-confirmation/confirm-registration';

/** What the late approval rule needs to know about an expired registration (#181 S4). */
export interface LateApprovalContext {
  /** The event has an end and it is already past. */
  eventEnded: boolean;
  /** The same person (email or phone) holds another pending or confirmed registration. */
  otherActiveRegistration: boolean;
}

/**
 * For a voided registration, returns the facts the late approval rule decides on when its payment
 * window expired, or null when it was voided for any other reason (it then stays voided).
 * Call it under the event's advisory lock, so no purchase for the same person can start between
 * this check and the confirmation.
 */
export async function lateApprovalContext(
  tx: RegistrationTransaction,
  registration: { id: string; eventId: string },
): Promise<LateApprovalContext | null> {
  const [expiry] = await tx
    .select({ id: registrationOperationAudit.id })
    .from(registrationOperationAudit)
    .where(
      and(
        eq(registrationOperationAudit.registrationId, registration.id),
        eq(registrationOperationAudit.operationType, 'registration_expiry'),
      ),
    )
    .limit(1);
  if (!expiry) return null;

  const [event] = await tx
    .select({ ended: sql<boolean>`coalesce(${events.endsAt} <= now(), false)` })
    .from(events)
    .where(eq(events.id, registration.eventId));

  const self = alias(participants, 'self');
  const other = alias(participants, 'other');
  const otherRegistration = alias(eventRegistrations, 'other_registration');
  const email = (column: AnyPgColumn) => sql`nullif(lower(btrim(${column})), '')`;
  const phone = (column: AnyPgColumn) => sql`nullif(${phoneMatchKeySql(column)}, '')`;
  const [match] = await tx
    .select({ id: otherRegistration.id })
    .from(eventRegistrations)
    .innerJoin(self, eq(self.id, eventRegistrations.participantId))
    .innerJoin(
      otherRegistration,
      and(
        eq(otherRegistration.eventId, eventRegistrations.eventId),
        ne(otherRegistration.id, eventRegistrations.id),
        ne(otherRegistration.status, 'voided'),
      ),
    )
    .innerJoin(other, eq(other.id, otherRegistration.participantId))
    .where(
      and(
        eq(eventRegistrations.id, registration.id),
        sql`(${email(self.email)} = ${email(other.email)} OR ${phone(self.phone)} = ${phone(other.phone)})`,
      ),
    )
    .limit(1);

  return { eventEnded: event?.ended ?? false, otherActiveRegistration: !!match };
}
