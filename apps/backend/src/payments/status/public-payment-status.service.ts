import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, eq } from 'drizzle-orm';
import { DATABASE_CLIENT } from '@/database/database.constants';
import type { DatabaseService } from '@/database/database.service';
import {
  eventRegistrations,
  participants,
  registrationCheckouts,
  registrationPayments,
} from '@/database/schema';
import { displayFirstName, readRegistrationPasses } from '@/notifications';
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

    const payments = await this.db
      .select({ status: registrationPayments.status })
      .from(registrationPayments)
      .innerJoin(
        registrationCheckouts,
        eq(registrationCheckouts.id, registrationPayments.checkoutId),
      )
      .where(eq(registrationCheckouts.registrationId, registrationId))
      .orderBy(asc(registrationPayments.createdAt), asc(registrationPayments.id));
    const status = decidePaymentStatus(
      registration.status,
      payments.map((payment) => payment.status),
    );

    const passes = await readRegistrationPasses(this.db, eventId, registrationId);

    return {
      status,
      firstName: displayFirstName(registration.firstName, registration.fullName),
      maskedEmail: maskEmail(registration.email),
      folio: status === 'confirmed' ? registration.folio : null,
      passes: passes.map(({ name, competitions }) => ({ name, competitions })),
      totalCents: passes.reduce((total, pass) => total + pass.priceCents, 0),
    };
  }
}
