import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { DATABASE_CLIENT } from '@/database/database.constants';
import type { DatabaseService } from '@/database/database.service';
import {
  activities,
  activityCheckIns,
  eventActivityRegistrations,
  eventCheckIns,
  eventRegistrations,
} from '@/database/schema';
import { RegistrationEntitlementsService } from '@/events/registration-entitlements/registration-entitlements.service';

type Database = DatabaseService['db'];
type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];
type Actor = { userId: string; sessionId: string };

const ELIGIBLE_KINDS = ['workshop', 'competition'];

/**
 * Check-in facts are idempotent: a repeat returns the first fact (original actor and time) with
 * `alreadyCheckedIn: true` instead of failing. The registration row lock serializes every
 * check-in of one registration, so concurrent duplicates write each fact once.
 */
@Injectable()
export class CheckInService {
  constructor(
    @Inject(DATABASE_CLIENT) private readonly db: Database,
    private readonly entitlements: RegistrationEntitlementsService,
  ) {}

  // One action at the activity entrance: pass access is the gate, and the event fact and the
  // legacy enrollment row (referenced by the activity fact) are recorded when missing.
  async createActivity(eventId: string, registrationId: string, activityId: string, actor: Actor) {
    return this.db.transaction(async (tx) => {
      await this.lockConfirmed(tx, eventId, registrationId);
      // Share lock keeps a concurrent archive or kind edit from interleaving with the check-in.
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
        ? await this.entitlements.accessibleActivityIds(tx, eventId, registrationId)
        : [];
      if (!activity || !accessible.includes(activityId))
        throw new BadRequestException('Registration has no pass access to this activity');
      if (!ELIGIBLE_KINDS.includes(activity.kind))
        throw new BadRequestException('Activity kind is not eligible for check-in');
      const eventFact = await this.recordEventFact(tx, eventId, registrationId, actor);
      const enrollmentId = await this.recordEnrollment(tx, eventId, registrationId, activityId);
      const fact = { id: activityCheckIns.id, checkedInAt: activityCheckIns.checkedInAt };
      const [created] = await tx
        .insert(activityCheckIns)
        .values({
          eventId,
          eventRegistrationId: registrationId,
          activityId,
          enrollmentId,
          eventCheckInId: eventFact.id,
          actorUserId: actor.userId,
          sessionId: actor.sessionId,
        })
        .onConflictDoNothing({
          target: [activityCheckIns.eventRegistrationId, activityCheckIns.activityId],
        })
        .returning(fact);
      const [existing] = created
        ? [created]
        : await tx
            .select(fact)
            .from(activityCheckIns)
            .where(
              and(
                eq(activityCheckIns.eventRegistrationId, registrationId),
                eq(activityCheckIns.activityId, activityId),
              ),
            );
      return {
        id: existing.id,
        eventId,
        registrationId,
        activityId,
        checkedInAt: existing.checkedInAt,
        alreadyCheckedIn: !created,
      };
    });
  }

  async create(eventId: string, registrationId: string, actor: Actor) {
    return this.db.transaction(async (tx) => {
      await this.lockConfirmed(tx, eventId, registrationId);
      const fact = await this.recordEventFact(tx, eventId, registrationId, actor);
      return {
        id: fact.id,
        eventId,
        registrationId,
        checkedInAt: fact.checkedInAt,
        alreadyCheckedIn: !fact.created,
      };
    });
  }

  // Serialize with other check-ins and with registration state changes.
  private async lockConfirmed(tx: Transaction, eventId: string, registrationId: string) {
    const [registration] = await tx
      .select({ status: eventRegistrations.status })
      .from(eventRegistrations)
      .where(
        and(eq(eventRegistrations.eventId, eventId), eq(eventRegistrations.id, registrationId)),
      )
      .for('update');
    if (registration?.status !== 'confirmed')
      throw new BadRequestException('Registration is not confirmed in this event');
  }

  private async recordEventFact(
    tx: Transaction,
    eventId: string,
    registrationId: string,
    actor: Actor,
  ) {
    const fact = { id: eventCheckIns.id, checkedInAt: eventCheckIns.checkedInAt };
    const [created] = await tx
      .insert(eventCheckIns)
      .values({
        eventId,
        eventRegistrationId: registrationId,
        actorUserId: actor.userId,
        sessionId: actor.sessionId,
      })
      .onConflictDoNothing({ target: eventCheckIns.eventRegistrationId })
      .returning(fact);
    if (created) return { ...created, created: true };
    const [existing] = await tx
      .select(fact)
      .from(eventCheckIns)
      .where(
        and(
          eq(eventCheckIns.eventId, eventId),
          eq(eventCheckIns.eventRegistrationId, registrationId),
        ),
      );
    return { ...existing, created: false };
  }

  private async recordEnrollment(
    tx: Transaction,
    eventId: string,
    registrationId: string,
    activityId: string,
  ) {
    const [created] = await tx
      .insert(eventActivityRegistrations)
      .values({ eventId, eventRegistrationId: registrationId, activityId })
      .onConflictDoNothing({
        target: [
          eventActivityRegistrations.eventRegistrationId,
          eventActivityRegistrations.activityId,
        ],
      })
      .returning({ id: eventActivityRegistrations.id });
    if (created) return created.id;
    const [existing] = await tx
      .select({ id: eventActivityRegistrations.id })
      .from(eventActivityRegistrations)
      .where(
        and(
          eq(eventActivityRegistrations.eventId, eventId),
          eq(eventActivityRegistrations.eventRegistrationId, registrationId),
          eq(eventActivityRegistrations.activityId, activityId),
        ),
      );
    return existing.id;
  }
}
