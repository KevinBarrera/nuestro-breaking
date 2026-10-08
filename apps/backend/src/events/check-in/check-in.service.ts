import { BadRequestException, ConflictException, Inject, Injectable } from '@nestjs/common';
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

@Injectable()
export class CheckInService {
  constructor(@Inject(DATABASE_CLIENT) private readonly db: DatabaseService['db']) {}

  async createActivity(
    eventId: string,
    registrationId: string,
    activityId: string,
    actor: { userId: string; sessionId: string },
  ) {
    return this.db.transaction(async (tx) => {
      const [registration] = await tx
        .select({ status: eventRegistrations.status })
        .from(eventRegistrations)
        .where(
          and(eq(eventRegistrations.eventId, eventId), eq(eventRegistrations.id, registrationId)),
        )
        .for('update');
      if (registration?.status !== 'confirmed')
        throw new BadRequestException('Registration is not confirmed in this event');
      const [enrollment] = await tx
        .select({ id: eventActivityRegistrations.id, kind: activities.kind })
        .from(eventActivityRegistrations)
        .innerJoin(
          activities,
          and(
            eq(activities.id, eventActivityRegistrations.activityId),
            eq(activities.eventId, eventActivityRegistrations.eventId),
          ),
        )
        .where(
          and(
            eq(eventActivityRegistrations.eventId, eventId),
            eq(eventActivityRegistrations.eventRegistrationId, registrationId),
            eq(eventActivityRegistrations.activityId, activityId),
          ),
        );
      if (!enrollment)
        throw new BadRequestException('Registration is not enrolled in this activity');
      if (!['workshop', 'battle', 'competition'].includes(enrollment.kind))
        throw new BadRequestException('Activity kind is not eligible for check-in');
      const [eventFact] = await tx
        .select({ id: eventCheckIns.id })
        .from(eventCheckIns)
        .where(
          and(
            eq(eventCheckIns.eventId, eventId),
            eq(eventCheckIns.eventRegistrationId, registrationId),
          ),
        );
      if (!eventFact)
        throw new BadRequestException('Event check-in required before activity check-in');
      const [fact] = await tx
        .insert(activityCheckIns)
        .values({
          eventId,
          eventRegistrationId: registrationId,
          activityId,
          enrollmentId: enrollment.id,
          eventCheckInId: eventFact.id,
          actorUserId: actor.userId,
          sessionId: actor.sessionId,
        })
        .onConflictDoNothing({
          target: [activityCheckIns.eventRegistrationId, activityCheckIns.activityId],
        })
        .returning({ id: activityCheckIns.id, checkedInAt: activityCheckIns.checkedInAt });
      if (!fact) throw new ConflictException('Activity already checked in');
      return { id: fact.id, eventId, registrationId, activityId, checkedInAt: fact.checkedInAt };
    });
  }

  async create(
    eventId: string,
    registrationId: string,
    actor: { userId: string; sessionId: string },
  ) {
    return this.db.transaction(async (tx) => {
      // Serialize with other check-ins and with registration state changes.
      const [registration] = await tx
        .select({ status: eventRegistrations.status })
        .from(eventRegistrations)
        .where(
          and(eq(eventRegistrations.eventId, eventId), eq(eventRegistrations.id, registrationId)),
        )
        .for('update');
      if (registration?.status !== 'confirmed')
        throw new BadRequestException('Registration is not confirmed in this event');
      const [fact] = await tx
        .insert(eventCheckIns)
        .values({
          eventId,
          eventRegistrationId: registrationId,
          actorUserId: actor.userId,
          sessionId: actor.sessionId,
        })
        .onConflictDoNothing({ target: eventCheckIns.eventRegistrationId })
        .returning({ id: eventCheckIns.id, checkedInAt: eventCheckIns.checkedInAt });
      if (!fact) throw new ConflictException('Registration already checked in');
      return { id: fact.id, eventId, registrationId, checkedInAt: fact.checkedInAt };
    });
  }
}
