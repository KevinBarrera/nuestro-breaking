import { Inject, Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { and, desc, eq, sql } from 'drizzle-orm';
import { DATABASE_CLIENT } from '@/database/database.constants';
import type { DatabaseService } from '@/database/database.service';
import {
  eventActivityRegistrations,
  eventRegistrationPasses,
  eventRegistrations,
  paymentWebhookNotifications,
  registrationCheckouts,
  registrationOperationAudit,
  registrationPayments,
} from '@/database/schema';
import { registrationAuditActorColumns } from '@/events/registration-audit/registration-audit-actor';
import {
  confirmRegistration,
  type RegistrationTransaction,
} from '@/events/registration-confirmation/confirm-registration';
import {
  MercadoPagoClient,
  MercadoPagoClientError,
  type ProviderPayment,
} from '@/payments/mercado-pago-client';
import { MERCADO_PAGO_CONFIG, type MercadoPagoConfig } from '@/payments/mercado-pago-config';
import { decidePayment } from './payment-decision';

type Database = DatabaseService['db'];

export interface WebhookNotification {
  /** Body `id`: Mercado Pago's notification id, the idempotency key. */
  notificationId: string | undefined;
  type: string | undefined;
  /** The signed `data.id`: the payment id to re-read. */
  dataId: string | undefined;
}

// Provider ids are short tokens; anything else is ignored, so it never reaches a URL or a log.
const PROVIDER_ID = /^[A-Za-z0-9_-]{1,64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const PROVIDER_UNAVAILABLE = {
  statusCode: 500,
  code: 'payment_provider_unavailable',
  message: 'The payment could not be read. Please retry.',
} as const;

@Injectable()
export class PaymentWebhookService {
  private readonly logger = new Logger(PaymentWebhookService.name);

  constructor(
    @Inject(DATABASE_CLIENT) private readonly db: Database,
    @Inject(MERCADO_PAGO_CONFIG) private readonly config: MercadoPagoConfig,
    private readonly mercadoPago: MercadoPagoClient,
  ) {}

  /**
   * Processes one verified notification at most once (#177 D11) and returns its outcome code.
   * The claim row is written before the payment read; a failed read leaves it unprocessed, so
   * Mercado Pago's retry re-claims it.
   */
  async handle({ notificationId, type, dataId }: WebhookNotification): Promise<string> {
    if (
      type !== 'payment' ||
      !PROVIDER_ID.test(dataId ?? '') ||
      !PROVIDER_ID.test(notificationId ?? '')
    )
      return 'ignored';
    const paymentId = dataId as string;
    const claimId = notificationId as string;
    await this.db
      .insert(paymentWebhookNotifications)
      .values({ notificationId: claimId, providerPaymentId: paymentId })
      .onConflictDoNothing({ target: paymentWebhookNotifications.notificationId });
    if (await this.isProcessed(this.db, claimId)) return 'duplicate';

    const payment = await this.readPayment(paymentId);
    const outcome = await this.db.transaction(async (tx) => {
      // Serializes concurrent deliveries of the same notification: the second waits here, then
      // sees it processed.
      if (await this.isProcessed(tx, claimId, true)) return 'duplicate';
      const result = await this.apply(tx, payment);
      await tx
        .update(paymentWebhookNotifications)
        .set({ processedAt: sql`now()`, outcome: result })
        .where(eq(paymentWebhookNotifications.notificationId, claimId));
      return result;
    });
    this.logger.log(`Mercado Pago payment ${paymentId} notification ${claimId}: ${outcome}`);
    return outcome;
  }

  private async isProcessed(db: Database | RegistrationTransaction, claimId: string, lock = false) {
    const query = db
      .select({ processedAt: paymentWebhookNotifications.processedAt })
      .from(paymentWebhookNotifications)
      .where(eq(paymentWebhookNotifications.notificationId, claimId));
    const [claim] = lock ? await query.for('update') : await query;
    return claim?.processedAt != null;
  }

  private async readPayment(paymentId: string): Promise<ProviderPayment> {
    try {
      return await this.mercadoPago.getPayment(paymentId);
    } catch (error) {
      // Client errors are token-free by construction; anything else is logged by kind only.
      this.logger.warn(
        error instanceof MercadoPagoClientError
          ? `${error.message} Payment ${paymentId}.`
          : `Mercado Pago payment ${paymentId} read failed unexpectedly.`,
      );
      throw new InternalServerErrorException(PROVIDER_UNAVAILABLE);
    }
  }

  private async apply(tx: RegistrationTransaction, payment: ProviderPayment): Promise<string> {
    const registrationId = UUID.test(payment.externalReference ?? '')
      ? (payment.externalReference as string)
      : null;
    const [registration] = registrationId
      ? await tx
          .select({
            id: eventRegistrations.id,
            eventId: eventRegistrations.eventId,
            status: eventRegistrations.status,
          })
          .from(eventRegistrations)
          .where(eq(eventRegistrations.id, registrationId))
          .for('update')
      : [];
    const [checkout] = registration
      ? await tx
          .select({ id: registrationCheckouts.id })
          .from(registrationCheckouts)
          .where(
            and(
              eq(registrationCheckouts.registrationId, registration.id),
              eq(registrationCheckouts.mode, this.config.mode),
            ),
          )
          .orderBy(desc(registrationCheckouts.createdAt), desc(registrationCheckouts.id))
          .limit(1)
      : [];
    const decision = decidePayment({
      payment,
      mode: this.config.mode,
      registration:
        registration && checkout
          ? {
              status: registration.status,
              expectedAmountCents: await this.expectedAmountCents(tx, registration.id),
              confirmedByThisPayment: await this.confirmedBy(tx, registration.id, payment.id),
            }
          : null,
    });
    if (!registration || !checkout) return decision.outcome;

    if (decision.recordPayment) {
      const values = {
        checkoutId: checkout.id,
        status: payment.status,
        amountCents: payment.transactionAmountCents,
        currency: payment.currencyId,
      };
      await tx
        .insert(registrationPayments)
        .values({ ...values, providerPaymentId: payment.id })
        .onConflictDoUpdate({
          target: registrationPayments.providerPaymentId,
          set: { ...values, updatedAt: sql`now()` },
        });
    }
    if (decision.confirm) await this.confirm(tx, registration, checkout.id, payment);
    return decision.outcome;
  }

  private async expectedAmountCents(tx: RegistrationTransaction, registrationId: string) {
    const [{ total }] = await tx
      .select({ total: sql<number>`coalesce(sum(${eventRegistrationPasses.priceCents}), 0)::int` })
      .from(eventRegistrationPasses)
      .where(eq(eventRegistrationPasses.eventRegistrationId, registrationId));
    return total;
  }

  private async confirmedBy(
    tx: RegistrationTransaction,
    registrationId: string,
    paymentId: string,
  ) {
    const [fact] = await tx
      .select({ id: registrationOperationAudit.id })
      .from(registrationOperationAudit)
      .where(
        and(
          eq(registrationOperationAudit.registrationId, registrationId),
          eq(registrationOperationAudit.operationType, 'payment_approval'),
          eq(registrationOperationAudit.reference, paymentId),
        ),
      )
      .limit(1);
    return !!fact;
  }

  /** Confirms with `approved_payment` and appends the `payment_approval` fact in the same transaction. */
  private async confirm(
    tx: RegistrationTransaction,
    registration: { id: string; eventId: string },
    checkoutId: string,
    payment: ProviderPayment,
  ) {
    const confirmed = await confirmRegistration(tx, {
      eventId: registration.eventId,
      registrationId: registration.id,
      source: 'approved_payment',
    });
    // The registration row is locked and was pending, so this only fails on a broken invariant.
    if (!confirmed) throw new Error('Locked pending registration could not be confirmed');
    const links = await tx
      .select({ id: eventActivityRegistrations.activityId })
      .from(eventActivityRegistrations)
      .where(eq(eventActivityRegistrations.eventRegistrationId, registration.id));
    await tx.insert(registrationOperationAudit).values({
      operationType: 'payment_approval',
      ...registrationAuditActorColumns({ kind: 'system' }),
      eventId: registration.eventId,
      registrationId: registration.id,
      participantId: confirmed.participantId,
      affectedActivityIds: links.map((link) => link.id),
      amountCents: payment.transactionAmountCents,
      reference: payment.id,
      beforeState: {
        status: 'pending_payment',
        confirmationSource: null,
        confirmedAt: null,
        folio: null,
      },
      afterState: {
        status: 'confirmed',
        confirmationSource: 'approved_payment',
        confirmedAt: confirmed.confirmedAt?.toISOString(),
        folio: confirmed.folio,
      },
      facts: { providerPaymentId: payment.id, checkoutId },
    });
  }
}
