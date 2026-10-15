import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { DATABASE_CLIENT } from '@/database/database.constants';
import type { DatabaseService } from '@/database/database.service';
import {
  activities,
  eventActivityRegistrations,
  eventRegistrations,
  participants,
  registrationOperationAudit,
} from '@/database/schema';
import { confirmRegistration } from '@/events/registration-confirmation/confirm-registration';
import {
  type AdminRegistrationAuditActor,
  registrationAuditActorColumns,
} from '@/events/registration-audit/registration-audit-actor';

type Manual = { fullName: string; phone: string; email: string | null; activityIds: string[] };
type Cash = {
  amount: number;
  reference: string | null;
  note: string | null;
  receipt: string | null;
};

@Injectable()
export class ManualRegistrationService {
  constructor(@Inject(DATABASE_CLIENT) private readonly db: DatabaseService['db']) {}

  async create(eventId: string, input: Manual, actor: AdminRegistrationAuditActor) {
    return this.db.transaction(async (tx) => {
      // Serialize manual creations per event, including comparisons with existing participants.
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${eventId}))`);
      const [duplicate] = await tx
        .select({ id: participants.id })
        .from(eventRegistrations)
        .innerJoin(participants, eq(eventRegistrations.participantId, participants.id))
        .where(
          and(
            eq(eventRegistrations.eventId, eventId),
            sql`(btrim(${participants.phone}) = ${input.phone} OR lower(btrim(${participants.email})) = ${input.email}::text)`,
          ),
        )
        .limit(1);
      if (duplicate) throw new BadRequestException('Duplicate registration');
      if (input.activityIds.length) {
        const found = await tx
          .select({ id: activities.id })
          .from(activities)
          .where(and(eq(activities.eventId, eventId), inArray(activities.id, input.activityIds)));
        if (found.length !== input.activityIds.length)
          throw new BadRequestException('Invalid activity');
      }
      const [participant] = await tx
        .insert(participants)
        .values({ fullName: input.fullName, phone: input.phone, email: input.email })
        .returning({ id: participants.id });
      const [registration] = await tx
        .insert(eventRegistrations)
        .values({ eventId, participantId: participant.id })
        .returning({ id: eventRegistrations.id });
      if (input.activityIds.length)
        await tx.insert(eventActivityRegistrations).values(
          input.activityIds.map((activityId) => ({
            eventId,
            eventRegistrationId: registration.id,
            activityId,
          })),
        );
      const [fact] = await tx
        .insert(registrationOperationAudit)
        .values({
          operationType: 'manual_registration',
          ...registrationAuditActorColumns(actor),
          eventId,
          registrationId: registration.id,
          participantId: participant.id,
          affectedActivityIds: input.activityIds,
          beforeState: { registration: null },
          afterState: {
            status: 'pending_payment',
            confirmationSource: null,
            confirmedAt: null,
            participantId: participant.id,
            activityIds: input.activityIds,
          },
          facts: { participantCreated: true },
        })
        .returning({ id: registrationOperationAudit.id });
      return {
        registrationId: registration.id,
        participantId: participant.id,
        eventId,
        status: 'pending_payment',
        auditId: fact.id,
      };
    });
  }

  async confirm(
    eventId: string,
    registrationId: string,
    input: Cash,
    actor: AdminRegistrationAuditActor,
  ) {
    return this.db.transaction(async (tx) => {
      const registration = await confirmRegistration(tx, {
        eventId,
        registrationId,
        source: 'admin_cash',
      });
      if (!registration) throw new BadRequestException('Registration is not pending in this event');
      const links = await tx
        .select({ id: eventActivityRegistrations.activityId })
        .from(eventActivityRegistrations)
        .where(
          and(
            eq(eventActivityRegistrations.eventId, eventId),
            eq(eventActivityRegistrations.eventRegistrationId, registrationId),
          ),
        );
      const activityIds = links.map((link) => link.id);
      const [fact] = await tx
        .insert(registrationOperationAudit)
        .values({
          operationType: 'cash_confirmation',
          ...registrationAuditActorColumns(actor),
          eventId,
          registrationId,
          participantId: registration.participantId,
          affectedActivityIds: activityIds,
          amountCents: input.amount,
          reference: input.reference,
          note: input.note,
          receipt: input.receipt,
          beforeState: {
            status: 'pending_payment',
            confirmationSource: null,
            confirmedAt: null,
            folio: null,
          },
          afterState: {
            status: 'confirmed',
            confirmationSource: 'admin_cash',
            confirmedAt: registration.confirmedAt?.toISOString(),
            folio: registration.folio,
          },
        })
        .returning({ id: registrationOperationAudit.id });
      return {
        registrationId,
        eventId,
        status: 'confirmed',
        folio: registration.folio,
        auditId: fact.id,
      };
    });
  }
}
