import { ConflictException, Inject, Injectable } from '@nestjs/common';
import { and, eq, max, sql } from 'drizzle-orm';
import { DATABASE_CLIENT } from '@/database/database.constants';
import type { DatabaseService } from '@/database/database.service';
import { activities, eventCompetitorNumbers } from '@/database/schema';
import type { AdminRegistrationAuditActor } from '@/events/registration-audit/registration-audit-actor';
import { RegistrationEntitlementsService } from '@/events/registration-entitlements/registration-entitlements.service';
import { mayHoldCompetitorNumber, nextCompetitorNumber } from './competitor-number.rules';
import type { CompetitorNumberAssignment } from './competitor-number.types';

type Database = DatabaseService['db'];
type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];

/**
 * The single writer of competitor numbers (#377), one per registration and competition. Callers
 * hold the registration row lock; a per-competition advisory lock then serializes every assignment
 * of that competition, so `MAX + 1` is unique there. It uses its own key, not `hashtext(eventId)`:
 * the payment webhook takes that one while already holding the voided registration's row lock, and
 * then locks other registrations in `expireDueRegistrations`; check-in holds a registration row
 * lock before this one, so sharing the key could deadlock.
 */
@Injectable()
export class CompetitorNumberService {
  constructor(
    @Inject(DATABASE_CLIENT) private readonly db: Database,
    private readonly entitlements: RegistrationEntitlementsService,
  ) {}

  /**
   * Gives the registration the competition's next number and returns the number it holds there
   * afterwards. The caller has checked that it may hold one. With `replace: false` (check-in) a
   * held number is kept; with `replace: true` (admin) it is retired.
   */
  async assign(
    tx: Transaction,
    eventId: string,
    registrationId: string,
    activityId: string,
    { replace }: { replace: boolean },
  ): Promise<{ competitorNumber: number; previous: number | null }> {
    const previous = await this.held(tx, registrationId, activityId);
    if (previous !== null && !replace) return { competitorNumber: previous, previous };
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${`competitor-number:${activityId}`}))`,
    );
    const [{ highest }] = await tx
      .select({ highest: max(eventCompetitorNumbers.competitorNumber) })
      .from(eventCompetitorNumbers)
      .where(eq(eventCompetitorNumbers.activityId, activityId));
    const competitorNumber = nextCompetitorNumber(highest);
    await tx
      .insert(eventCompetitorNumbers)
      .values({ eventId, eventRegistrationId: registrationId, activityId, competitorNumber })
      .onConflictDoUpdate({
        target: [eventCompetitorNumbers.eventRegistrationId, eventCompetitorNumbers.activityId],
        set: { competitorNumber, assignedAt: sql`now()` },
      });
    return { competitorNumber, previous };
  }

  /**
   * Admin assignment or change in one competition: always that competition's next number,
   * recorded in the registration operation audit with the previous number (null on a first
   * assignment) and the new one.
   */
  async assignByAdmin(
    eventId: string,
    registrationId: string,
    activityId: string,
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
      // Share lock keeps a concurrent archive or kind edit from interleaving, as at check-in.
      const [activity] = await tx
        .select({ kind: activities.kind })
        .from(activities)
        .where(
          and(
            eq(activities.eventId, eventId),
            eq(activities.id, activityId),
            eq(activities.status, 'active'),
          ),
        )
        .for('share');
      const accessible = activity
        ? (await this.entitlements.accessibleActivityIds(tx, eventId, registrationId)).includes(
            activityId,
          )
        : false;
      const { status } = registration;
      if (!mayHoldCompetitorNumber({ status, kind: activity?.kind ?? null, accessible }))
        throw new ConflictException({
          statusCode: 409,
          message: 'Registration has no access to this competition',
          code: 'competitor_number_not_eligible',
        });
      const { competitorNumber, previous } = await this.assign(
        tx,
        eventId,
        registrationId,
        activityId,
        { replace: true },
      );
      await this.entitlements.audit(tx, actor, registration, {
        operationType: 'competitor_number_assignment',
        affectedActivityIds: [activityId],
        beforeState: { status, activityId, competitorNumber: previous },
        afterState: { status, activityId, competitorNumber },
        facts: {},
      });
      return { registrationId, activityId, competitorNumber, previousCompetitorNumber: previous };
    });
  }

  private async held(tx: Transaction, registrationId: string, activityId: string) {
    const [row] = await tx
      .select({ competitorNumber: eventCompetitorNumbers.competitorNumber })
      .from(eventCompetitorNumbers)
      .where(
        and(
          eq(eventCompetitorNumbers.eventRegistrationId, registrationId),
          eq(eventCompetitorNumbers.activityId, activityId),
        ),
      );
    return row?.competitorNumber ?? null;
  }
}
