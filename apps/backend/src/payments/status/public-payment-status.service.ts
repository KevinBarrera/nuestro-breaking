import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { DATABASE_CLIENT } from '@/database/database.constants';
import type { DatabaseService } from '@/database/database.service';
import {
  activities,
  eventPassTypes,
  eventRegistrationPassSelections,
  eventRegistrationPasses,
  eventRegistrations,
  participants,
  registrationCheckouts,
  registrationPayments,
} from '@/database/schema';
import { decidePaymentStatus, maskEmail } from './payment-status';
import type { PublicPaymentStatusResponse } from './public-payment-status.types';

type Database = DatabaseService['db'];

@Injectable()
export class PublicPaymentStatusService {
  constructor(@Inject(DATABASE_CLIENT) private readonly db: Database) {}

  /**
   * The payment result of a registration of this event (#178 D3, D4). A registration of another
   * event is the same 404 as an unknown one, so the answer never says where a registration lives.
   */
  async paymentStatus(
    eventId: string,
    registrationId: string,
  ): Promise<PublicPaymentStatusResponse> {
    const [registration] = await this.db
      .select({
        status: eventRegistrations.status,
        folio: eventRegistrations.folio,
        firstName: participants.firstName,
        fullName: participants.fullName,
        email: participants.email,
      })
      .from(eventRegistrations)
      .innerJoin(participants, eq(participants.id, eventRegistrations.participantId))
      .where(
        and(eq(eventRegistrations.id, registrationId), eq(eventRegistrations.eventId, eventId)),
      );
    if (!registration) throw new NotFoundException('Registration not found');

    const [latestPayment] = await this.db
      .select({ status: registrationPayments.status })
      .from(registrationPayments)
      .innerJoin(
        registrationCheckouts,
        eq(registrationCheckouts.id, registrationPayments.checkoutId),
      )
      .where(eq(registrationCheckouts.registrationId, registrationId))
      .orderBy(
        desc(registrationPayments.updatedAt),
        desc(registrationPayments.createdAt),
        desc(registrationPayments.id),
      )
      .limit(1);
    const status = decidePaymentStatus(registration.status, latestPayment?.status ?? null);

    const passes = await this.db
      .select({
        id: eventRegistrationPasses.id,
        name: eventPassTypes.name,
        priceCents: eventRegistrationPasses.priceCents,
      })
      .from(eventRegistrationPasses)
      .innerJoin(eventPassTypes, eq(eventPassTypes.id, eventRegistrationPasses.passTypeId))
      .where(
        and(
          eq(eventRegistrationPasses.eventId, eventId),
          eq(eventRegistrationPasses.eventRegistrationId, registrationId),
        ),
      )
      .orderBy(asc(eventRegistrationPasses.createdAt), asc(eventRegistrationPasses.id));
    const selections = passes.length
      ? await this.db
          .select({
            registrationPassId: eventRegistrationPassSelections.registrationPassId,
            name: activities.name,
          })
          .from(eventRegistrationPassSelections)
          .innerJoin(activities, eq(activities.id, eventRegistrationPassSelections.activityId))
          .where(
            and(
              eq(eventRegistrationPassSelections.eventId, eventId),
              inArray(
                eventRegistrationPassSelections.registrationPassId,
                passes.map((pass) => pass.id),
              ),
            ),
          )
          .orderBy(asc(activities.startsAt), asc(activities.name))
      : [];

    return {
      status,
      // Admin manual registrations may only have a display name; its first word stands in.
      firstName: registration.firstName ?? registration.fullName.trim().split(/\s+/)[0],
      maskedEmail: maskEmail(registration.email),
      folio: status === 'confirmed' ? registration.folio : null,
      passes: passes.map((pass) => ({
        name: pass.name,
        competitions: selections
          .filter((selection) => selection.registrationPassId === pass.id)
          .map((selection) => selection.name),
      })),
      totalCents: passes.reduce((total, pass) => total + pass.priceCents, 0),
    };
  }
}
