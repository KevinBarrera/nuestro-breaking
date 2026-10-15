import { and, asc, eq, isNotNull, lte, sql } from 'drizzle-orm';
import { eventRegistrations, registrationOperationAudit } from '@/database/schema';
import { registrationAuditActorColumns } from '@/events/registration-audit/registration-audit-actor';
import type { RegistrationTransaction } from '@/events/registration-confirmation/confirm-registration';

export interface ExpiryScope {
  eventId?: string;
  registrationId?: string;
}

export interface ExpiryOptions {
  /** At most this many registrations are expired in one call; unlimited when absent. */
  limit?: number;
  /** Skip rows another transaction holds (the sweep), instead of waiting for them. */
  skipLocked?: boolean;
}

/**
 * Voids the online `pending_payment` registrations in scope whose payment window has ended
 * (#181 S2), inside the caller's transaction, and appends one `registration_expiry` fact per
 * registration with the system actor. Admin manual registrations have no `expires_at`, so they
 * never match. Each row is locked and re-checked, so a registration confirmed meanwhile stays
 * confirmed. Returns how many registrations were voided.
 */
export async function expireDueRegistrations(
  tx: RegistrationTransaction,
  scope: ExpiryScope,
  { limit, skipLocked = false }: ExpiryOptions = {},
): Promise<number> {
  const query = tx
    .select({
      id: eventRegistrations.id,
      eventId: eventRegistrations.eventId,
      participantId: eventRegistrations.participantId,
      expiresAt: eventRegistrations.expiresAt,
    })
    .from(eventRegistrations)
    .where(
      and(
        eq(eventRegistrations.status, 'pending_payment'),
        isNotNull(eventRegistrations.expiresAt),
        lte(eventRegistrations.expiresAt, sql`now()`),
        scope.eventId ? eq(eventRegistrations.eventId, scope.eventId) : undefined,
        scope.registrationId ? eq(eventRegistrations.id, scope.registrationId) : undefined,
      ),
    )
    .orderBy(asc(eventRegistrations.expiresAt), asc(eventRegistrations.id))
    .$dynamic();
  if (limit !== undefined) query.limit(limit);
  const due = await query.for('update', skipLocked ? { skipLocked: true } : undefined);

  for (const registration of due) {
    await tx
      .update(eventRegistrations)
      .set({ status: 'voided', updatedAt: sql`now()` })
      .where(eq(eventRegistrations.id, registration.id));
    await tx.insert(registrationOperationAudit).values({
      operationType: 'registration_expiry',
      ...registrationAuditActorColumns({ kind: 'system' }),
      eventId: registration.eventId,
      registrationId: registration.id,
      participantId: registration.participantId,
      beforeState: { status: 'pending_payment', expiresAt: registration.expiresAt?.toISOString() },
      afterState: { status: 'voided' },
      facts: { reason: 'payment_window_expired' },
    });
  }
  return due.length;
}
