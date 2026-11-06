import { ConflictException, Inject, Injectable } from '@nestjs/common';
import { and, eq, inArray, max, sql } from 'drizzle-orm';
import { DATABASE_CLIENT } from '@/database/database.constants';
import type { DatabaseService } from '@/database/database.service';
import { activities, eventRegistrations } from '@/database/schema';
import type { AdminRegistrationAuditActor } from '@/events/registration-audit/registration-audit-actor';
import { RegistrationEntitlementsService } from '@/events/registration-entitlements/registration-entitlements.service';
import { isCompetitor, nextCompetitorNumber } from './competitor-number.rules';
import type { CompetitorNumberAssignment } from './competitor-number.types';

type Database = DatabaseService['db'];
type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];

/** The registration fields assignment needs, read under the caller's registration row lock. */
export type CompetitorCandidate = { id: string; status: string; competitorNumber: number | null };

/**
 * The single writer of competitor numbers (#377). Callers hold the registration row lock; the
 * event-wide advisory lock then serializes every assignment of the event, so `MAX + 1` is unique.
 * It uses its own key, not `hashtext(eventId)`: the payment webhook takes that one before a
 * registration row lock, and check-in holds the row lock first, so sharing it could deadlock.
 */
@Injectable()
export class CompetitorNumberService {
  constructor(
    @Inject(DATABASE_CLIENT) private readonly db: Database,
    private readonly entitlements: RegistrationEntitlementsService,
  ) {}

  /**
   * Gives an eligible registration the event's next number and returns the number it holds
   * afterwards. With `replace: false` (check-in) a held number is kept, even when the registration
   * is no longer eligible. With `replace: true` (admin) a held number is retired. Returns null when
   * the registration needs a number and is not eligible; nothing is written then.
   */
  async assign(
    tx: Transaction,
    eventId: string,
    registration: CompetitorCandidate,
    { replace }: { replace: boolean },
  ): Promise<number | null> {
    if (registration.competitorNumber !== null && !replace) return registration.competitorNumber;
    if (!(await this.isEligible(tx, eventId, registration))) return null;
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${`competitor-number:${eventId}`}))`,
    );
    const [{ highest }] = await tx
      .select({ highest: max(eventRegistrations.competitorNumber) })
      .from(eventRegistrations)
      .where(eq(eventRegistrations.eventId, eventId));
    const competitorNumber = nextCompetitorNumber(highest);
    await tx
      .update(eventRegistrations)
      .set({ competitorNumber, updatedAt: sql`now()` })
      .where(
        and(eq(eventRegistrations.eventId, eventId), eq(eventRegistrations.id, registration.id)),
      );
    return competitorNumber;
  }

  /**
   * Admin assignment or change (#377 S6): always the next number, recorded in the registration
   * operation audit with the previous number (null on a first assignment) and the new one.
   */
  async assignByAdmin(
    eventId: string,
    registrationId: string,
    actor: AdminRegistrationAuditActor,
  ): Promise<CompetitorNumberAssignment> {
    return this.db.transaction(async (tx) => {
      const registration = await this.entitlements.lockRegistration(tx, eventId, registrationId);
      if (registration.status !== 'confirmed')
        throw new ConflictException({
          statusCode: 409,
          message: 'Registration is not confirmed',
          code: 'competitor_number_not_confirmed',
        });
      const previousCompetitorNumber = registration.competitorNumber;
      const competitorNumber = await this.assign(tx, eventId, registration, { replace: true });
      if (competitorNumber === null)
        throw new ConflictException({
          statusCode: 409,
          message: 'Registration has no competition',
          code: 'competitor_number_not_eligible',
        });
      const { status } = registration;
      await this.entitlements.audit(tx, actor, registration, {
        operationType: 'competitor_number_assignment',
        affectedActivityIds: [],
        beforeState: { status, competitorNumber: previousCompetitorNumber },
        afterState: { status, competitorNumber },
        facts: {},
      });
      return { registrationId, competitorNumber, previousCompetitorNumber };
    });
  }

  // Eligibility (#377 S2) reuses the access rule and keeps only competition activities.
  private async isEligible(tx: Transaction, eventId: string, registration: CompetitorCandidate) {
    if (registration.status !== 'confirmed') return false;
    const ids = await this.entitlements.accessibleActivityIds(tx, eventId, registration.id);
    if (ids.length === 0) return false;
    const kinds = await tx
      .select({ kind: activities.kind })
      .from(activities)
      .where(and(eq(activities.eventId, eventId), inArray(activities.id, ids)));
    return isCompetitor(
      registration.status,
      kinds.map((row) => row.kind),
    );
  }
}
