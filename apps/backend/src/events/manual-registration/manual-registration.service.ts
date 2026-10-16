import { BadRequestException, ConflictException, Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, inArray, ne, or, sql } from 'drizzle-orm';
import { DATABASE_CLIENT } from '@/database/database.constants';
import type { DatabaseService } from '@/database/database.service';
import {
  activities,
  eventActivityRegistrations,
  eventRegistrations,
  participants,
  registrationOperationAudit,
} from '@/database/schema';
import { isUniqueViolation } from '@/events/admin-events/unique-violation';
import { phoneMatchKeySql } from '@/events/participant-profile/participant-match-sql';
import {
  buildFullName,
  phoneMatchKey,
} from '@/events/participant-profile/participant-normalization';
import type { PublicRegistrationBuyer } from '@/events/public-registration/public-registration.types';
import { confirmRegistration } from '@/events/registration-confirmation/confirm-registration';
import { expireDueRegistrations } from '@/events/registration-expiry/expire-registrations';
import {
  type AdminRegistrationAuditActor,
  registrationAuditActorColumns,
} from '@/events/registration-audit/registration-audit-actor';
import { maskEmail, maskPhone } from './mask-contact';

type Manual = {
  participant: PublicRegistrationBuyer;
  activityIds: string[];
  confirmedDuplicateRegistrationIds: string[];
};
type Cash = {
  amount: number;
  reference: string | null;
  note: string | null;
  receipt: string;
};

/** A same-event registration that may belong to the person being registered (#125). */
export type PossibleDuplicate = {
  registrationId: string;
  fullName: string;
  stageName: string | null;
  folio: string | null;
  status: string;
  maskedEmail: string | null;
  maskedPhone: string | null;
};

const CASH_RECEIPT_UNIQUE = 'registration_operation_audit_cash_receipt_uq';

/** 409 listing possible duplicates the administrator must confirm before the registration is made. */
function possibleDuplicates(matches: PossibleDuplicate[]) {
  return new ConflictException({
    statusCode: 409,
    message: 'Possible duplicate registrations need confirmation',
    code: 'possible_duplicates',
    matches,
  });
}

function receiptTaken() {
  return new ConflictException({
    statusCode: 409,
    message: 'Receipt number already used in this event',
    code: 'receipt_taken',
  });
}

@Injectable()
export class ManualRegistrationService {
  constructor(@Inject(DATABASE_CLIENT) private readonly db: DatabaseService['db']) {}

  async create(eventId: string, input: Manual, actor: AdminRegistrationAuditActor) {
    const p = input.participant;
    return this.db.transaction(async (tx) => {
      // Serialize manual creations per event, including comparisons with existing participants.
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${eventId}))`);
      // Expired online registrations are voided first, so they never count, as in public
      // registration. Voided registrations never count.
      await expireDueRegistrations(tx, { eventId });
      const matches = await this.possibleDuplicates(tx, eventId, input.participant);
      const confirmed = new Set(input.confirmedDuplicateRegistrationIds);
      // Rechecked under the lock: a match that appeared after the preview needs confirmation too.
      if (matches.some((match) => !confirmed.has(match.registrationId)))
        throw possibleDuplicates(matches);
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
        .values({
          fullName: buildFullName(p.firstName, p.firstLastName, p.secondLastName),
          firstName: p.firstName,
          firstLastName: p.firstLastName,
          secondLastName: p.secondLastName,
          stageName: p.stageName,
          email: p.email,
          phone: p.phone,
          city: p.city,
          instagram: p.instagram,
          level: p.level,
          birthDate: p.birthDate,
        })
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
          // Ids only: the audit never stores names or contact data.
          facts: {
            participantCreated: true,
            possibleDuplicatesConfirmed: matches.map((match) => match.registrationId).sort(),
          },
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
    try {
      return await this.confirmInTransaction(eventId, registrationId, input, actor);
    } catch (error) {
      // The unique index rejects a reused receipt even under concurrent requests; the whole
      // transaction rolls back, so nothing is written.
      if (isUniqueViolation(error, CASH_RECEIPT_UNIQUE)) throw receiptTaken();
      throw error;
    }
  }

  private async confirmInTransaction(
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

  /**
   * Same-event registrations, not voided, whose participant has the same email (lowercased and
   * trimmed) or the same phone match key as public registration uses (#125, #174 D5).
   */
  private async possibleDuplicates(
    tx: Parameters<Parameters<DatabaseService['db']['transaction']>[0]>[0],
    eventId: string,
    participant: PublicRegistrationBuyer,
  ): Promise<PossibleDuplicate[]> {
    const rows = await tx
      .select({
        registrationId: eventRegistrations.id,
        fullName: participants.fullName,
        stageName: participants.stageName,
        folio: eventRegistrations.folio,
        status: eventRegistrations.status,
        email: participants.email,
        phone: participants.phone,
      })
      .from(eventRegistrations)
      .innerJoin(participants, eq(participants.id, eventRegistrations.participantId))
      .where(
        and(
          eq(eventRegistrations.eventId, eventId),
          ne(eventRegistrations.status, 'voided'),
          or(
            sql`lower(btrim(${participants.email})) = ${participant.email}::text`,
            sql`${phoneMatchKeySql(participants.phone)} = ${phoneMatchKey(participant.phone)}`,
          ),
        ),
      )
      .orderBy(asc(eventRegistrations.createdAt), asc(eventRegistrations.id));
    return rows.map(({ email, phone, ...row }) => ({
      ...row,
      maskedEmail: maskEmail(email),
      maskedPhone: maskPhone(phone),
    }));
  }
}
