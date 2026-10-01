import { BadRequestException, ConflictException, Inject, Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { DATABASE_CLIENT } from '@/database/database.constants';
import type { DatabaseService } from '@/database/database.service';
import { eventCheckIns, eventRegistrations } from '@/database/schema';

@Injectable()
export class CheckInService {
  constructor(@Inject(DATABASE_CLIENT) private readonly db: DatabaseService['db']) {}

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
