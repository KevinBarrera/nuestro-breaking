import { and, eq, sql } from 'drizzle-orm';
import type { DatabaseService } from '@/database/database.service';
import { eventRegistrations, events } from '@/database/schema';
import { generateFolio } from './registration-folio';

export type RegistrationTransaction = Parameters<
  Parameters<DatabaseService['db']['transaction']>[0]
>[0];

export type ConfirmationSource = 'admin_cash' | 'approved_payment';

export type ConfirmedRegistration = {
  id: string;
  participantId: string;
  folio: string;
  confirmedAt: Date | null;
};

const FOLIO_UNIQUE_CONSTRAINT = 'event_registrations_folio_uq';
export const FOLIO_ATTEMPTS = 5;

/**
 * Moves a `pending_payment` registration of the event to `confirmed`, inside the caller's
 * transaction, and assigns its folio. Every confirmation path uses it: cash confirmation now and an
 * approved online payment (#177). Returns null when the registration is not pending in this event.
 *
 * Each attempt runs under a savepoint, so a folio collision on the system-wide unique constraint
 * rolls back only that attempt and the next one draws a new code.
 */
export async function confirmRegistration(
  tx: RegistrationTransaction,
  input: { eventId: string; registrationId: string; source: ConfirmationSource },
  nextFolio: (prefix: string) => string = generateFolio,
): Promise<ConfirmedRegistration | null> {
  const [event] = await tx
    .select({ folioPrefix: events.folioPrefix })
    .from(events)
    .where(eq(events.id, input.eventId));
  if (!event) return null;
  for (let attempt = 1; attempt <= FOLIO_ATTEMPTS; attempt += 1) {
    const folio = nextFolio(event.folioPrefix);
    try {
      return await tx.transaction(async (savepoint) => {
        const [registration] = await savepoint
          .update(eventRegistrations)
          .set({
            status: 'confirmed',
            confirmationSource: input.source,
            confirmedAt: sql`now()`,
            folio,
            updatedAt: sql`now()`,
          })
          .where(
            and(
              eq(eventRegistrations.id, input.registrationId),
              eq(eventRegistrations.eventId, input.eventId),
              eq(eventRegistrations.status, 'pending_payment'),
            ),
          )
          .returning({
            id: eventRegistrations.id,
            participantId: eventRegistrations.participantId,
            folio: eventRegistrations.folio,
            confirmedAt: eventRegistrations.confirmedAt,
          });
        return registration ? { ...registration, folio: registration.folio ?? folio } : null;
      });
    } catch (error) {
      if (!isFolioConflict(error)) throw error;
    }
  }
  throw new Error(`Could not assign a unique registration folio after ${FOLIO_ATTEMPTS} attempts`);
}

// Drizzle wraps driver errors; the PostgreSQL error may sit on the error itself or on `cause`.
function isFolioConflict(error: unknown): boolean {
  for (let current = error; current && typeof current === 'object';) {
    const candidate = current as { code?: unknown; constraint_name?: unknown; cause?: unknown };
    if (candidate.code === '23505' && candidate.constraint_name === FOLIO_UNIQUE_CONSTRAINT)
      return true;
    current = candidate.cause;
  }
  return false;
}
