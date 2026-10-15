import {
  BadGatewayException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, eq, isNotNull } from 'drizzle-orm';
import { DATABASE_CLIENT } from '@/database/database.constants';
import { expireDueRegistrations } from '@/events/registration-expiry';
import {
  PENDING_PAYMENT_WINDOW,
  paymentDeadlines,
  type PendingPaymentWindow,
} from '@/events/shared/pending-payment-window';
import {
  SERVICE_CHARGE,
  serviceChargeCents,
  type ServiceCharge,
} from '@/events/shared/service-charge';
import type { DatabaseService } from '@/database/database.service';
import {
  eventPassTypes,
  eventRegistrationPasses,
  eventRegistrations,
  registrationCheckouts,
} from '@/database/schema';
import {
  MercadoPagoClient,
  MercadoPagoClientError,
  type CreatedPreference,
} from '@/payments/mercado-pago-client';
import { MERCADO_PAGO_CONFIG, type MercadoPagoConfig } from '@/payments/mercado-pago-config';
import { buildPreferenceRequest } from './checkout-preference';

type Database = DatabaseService['db'];

// Neutral answers: they never say which event a registration belongs to or who holds it.
const NOT_PAYABLE = {
  statusCode: 409,
  code: 'registration_not_payable',
  message: 'This registration cannot be paid online.',
} as const;
const PROVIDER_UNAVAILABLE = {
  statusCode: 502,
  code: 'payment_provider_unavailable',
  message: 'The payment provider is unavailable. Please try again.',
} as const;

@Injectable()
export class PublicCheckoutService {
  private readonly logger = new Logger(PublicCheckoutService.name);

  constructor(
    @Inject(DATABASE_CLIENT) private readonly db: Database,
    @Inject(MERCADO_PAGO_CONFIG) private readonly config: MercadoPagoConfig,
    @Inject(PENDING_PAYMENT_WINDOW) private readonly paymentWindow: PendingPaymentWindow,
    @Inject(SERVICE_CHARGE) private readonly serviceCharge: ServiceCharge,
    private readonly mercadoPago: MercadoPagoClient,
  ) {}

  /**
   * Creates a new Checkout Pro preference for a `pending_payment` registration of this event and
   * records it (#177 D8). Each call makes a fresh preference, so a retry after a rejected card
   * gets one too. Each preference opens a new offline payment window, and the registration's
   * expiry, when it has one, moves to one day after it (#181 S1). Nothing is written when the provider call fails.
   */
  async createCheckout(
    eventId: string,
    slug: string,
    registrationId: string,
  ): Promise<{ checkoutUrl: string }> {
    // An expired registration is voided here, so it answers as not payable (#181 S2).
    await this.db.transaction((tx) => expireDueRegistrations(tx, { eventId, registrationId }));
    const [registration] = await this.db
      .select({ status: eventRegistrations.status })
      .from(eventRegistrations)
      .where(
        and(eq(eventRegistrations.id, registrationId), eq(eventRegistrations.eventId, eventId)),
      );
    if (!registration) throw new NotFoundException('Registration not found');
    if (registration.status !== 'pending_payment') throw new ConflictException(NOT_PAYABLE);

    const passes = await this.db
      .select({ name: eventPassTypes.name, priceCents: eventRegistrationPasses.priceCents })
      .from(eventRegistrationPasses)
      .innerJoin(eventPassTypes, eq(eventPassTypes.id, eventRegistrationPasses.passTypeId))
      .where(
        and(
          eq(eventRegistrationPasses.eventId, eventId),
          eq(eventRegistrationPasses.eventRegistrationId, registrationId),
        ),
      )
      .orderBy(asc(eventRegistrationPasses.createdAt), asc(eventRegistrationPasses.id));
    const passesCents = passes.reduce((total, pass) => total + pass.priceCents, 0);
    if (passesCents <= 0) throw new ConflictException(NOT_PAYABLE);
    // Online buyers pay the Mercado Pago fee on top of the passes (#239); cash registrations
    // never reach this path.
    const chargeCents = serviceChargeCents(this.serviceCharge, passesCents);

    const { paymentDueAt, expiresAt } = paymentDeadlines(this.paymentWindow, new Date());
    const preference = await this.createPreference(
      buildPreferenceRequest({
        registrationId,
        slug,
        passes,
        serviceChargeCents: chargeCents,
        publicAppUrl: this.config.publicAppUrl,
        notificationUrl: this.config.notificationUrl,
        paymentDueAt,
      }),
    );
    await this.db.transaction(async (tx) => {
      // The registration may have expired or been paid during the provider call; only a still
      // pending one gets the payment link (the preference is left unused at Mercado Pago).
      const [current] = await tx
        .select({ status: eventRegistrations.status })
        .from(eventRegistrations)
        .where(eq(eventRegistrations.id, registrationId))
        .for('update');
      if (current?.status !== 'pending_payment') throw new ConflictException(NOT_PAYABLE);
      await tx.insert(registrationCheckouts).values({
        registrationId,
        mode: this.config.mode,
        preferenceId: preference.preferenceId,
        amountCents: passesCents + chargeCents,
        serviceChargeCents: chargeCents,
        currency: 'MXN',
      });
      await tx
        .update(eventRegistrations)
        .set({ expiresAt, updatedAt: new Date() })
        .where(
          and(
            eq(eventRegistrations.id, registrationId),
            // Admin manual registrations have no expiry and keep none (#181 S2).
            isNotNull(eventRegistrations.expiresAt),
          ),
        );
    });
    return { checkoutUrl: preference.checkoutUrl };
  }

  private async createPreference(
    request: Parameters<MercadoPagoClient['createPreference']>[0],
  ): Promise<CreatedPreference> {
    try {
      return await this.mercadoPago.createPreference(request);
    } catch (error) {
      // Client errors are token-free by construction; anything else is logged by kind only.
      this.logger.warn(
        error instanceof MercadoPagoClientError
          ? error.message
          : 'Mercado Pago preference request failed unexpectedly.',
      );
      throw new BadGatewayException(PROVIDER_UNAVAILABLE);
    }
  }
}
