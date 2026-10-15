import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, inArray, isNotNull, notInArray } from 'drizzle-orm';
import { DATABASE_CLIENT } from '@/database/database.constants';
import { type DatabaseService } from '@/database/database.service';
import {
  eventRegistrations,
  events,
  participants,
  paymentWebhookNotifications,
  registrationCheckouts,
  registrationPayments,
} from '@/database/schema';
import {
  FLAGGED_PAYMENT_REASONS,
  type FlaggedPaymentReason,
  type FlaggedPayments,
  UNREAD_PAYMENT_OUTCOMES,
} from './flagged-payments.types';

@Injectable()
export class FlaggedPaymentsService {
  constructor(@Inject(DATABASE_CLIENT) private readonly db: DatabaseService['db']) {}

  /**
   * Lists the event's payments whose latest processed outcome is flagged, newest payment first.
   * A payment notified several times is one row; a payment whose latest outcome is no longer
   * flagged (for example refunded in Mercado Pago) drops off the list. A later failed read of the
   * payment does not count as an outcome.
   */
  async list(eventId: string): Promise<FlaggedPayments> {
    const [event] = await this.db
      .select({ id: events.id })
      .from(events)
      .where(eq(events.id, eventId));
    if (!event) throw new NotFoundException('Event not found');

    const notifications = paymentWebhookNotifications;
    const latest = this.db
      .selectDistinctOn([notifications.providerPaymentId], {
        providerPaymentId: notifications.providerPaymentId,
        outcome: notifications.outcome,
      })
      .from(notifications)
      .where(
        and(
          isNotNull(notifications.processedAt),
          isNotNull(notifications.outcome),
          notInArray(notifications.outcome, [...UNREAD_PAYMENT_OUTCOMES]),
        ),
      )
      .orderBy(
        notifications.providerPaymentId,
        desc(notifications.processedAt),
        desc(notifications.receivedAt),
      )
      .as('latest');

    const rows = await this.db
      .select({
        providerPaymentId: registrationPayments.providerPaymentId,
        reason: latest.outcome,
        receivedAt: registrationPayments.createdAt,
        amountCents: registrationPayments.amountCents,
        registrationId: eventRegistrations.id,
        folio: eventRegistrations.folio,
        participantName: participants.fullName,
        status: eventRegistrations.status,
      })
      .from(latest)
      .innerJoin(
        registrationPayments,
        eq(registrationPayments.providerPaymentId, latest.providerPaymentId),
      )
      .innerJoin(
        registrationCheckouts,
        eq(registrationCheckouts.id, registrationPayments.checkoutId),
      )
      .innerJoin(
        eventRegistrations,
        eq(eventRegistrations.id, registrationCheckouts.registrationId),
      )
      .innerJoin(participants, eq(participants.id, eventRegistrations.participantId))
      .where(
        and(
          eq(eventRegistrations.eventId, eventId),
          inArray(latest.outcome, [...FLAGGED_PAYMENT_REASONS]),
        ),
      )
      .orderBy(desc(registrationPayments.createdAt), desc(registrationPayments.providerPaymentId));

    return {
      payments: rows.map((row) => ({
        providerPaymentId: row.providerPaymentId,
        reason: row.reason as FlaggedPaymentReason,
        receivedAt: row.receivedAt.toISOString(),
        amountCents: row.amountCents,
        registration: {
          id: row.registrationId,
          folio: row.folio,
          participantName: row.participantName,
          status: row.status,
        },
      })),
    };
  }
}
