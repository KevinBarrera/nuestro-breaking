import { Module } from '@nestjs/common';
import { DatabaseModule } from '@/database/database.module';
import { PublicCatalogService } from '@/events/public-catalog';
import { EXPIRY_SWEEP_INTERVAL_MS, readExpirySweepInterval } from '@/events/registration-expiry';
import {
  PENDING_PAYMENT_WINDOW,
  readPendingPaymentWindow,
} from '@/events/shared/pending-payment-window';
import { SERVICE_CHARGE, readServiceCharge } from '@/events/shared/service-charge';
import { PublicRateLimitModule } from '@/http';
import { IdentityAccessModule } from '@/identity-access/identity-access.module';
import { NotificationsModule } from '@/notifications';
import { PublicCheckoutController } from './checkout/public-checkout.controller';
import { PublicCheckoutService } from './checkout/public-checkout.service';
import { FetchMercadoPagoClient } from './fetch-mercado-pago-client';
import { MercadoPagoClient } from './mercado-pago-client';
import { PaymentReconciliationSweeper } from './reconciliation/payment-reconciliation-sweeper';
import { FlaggedPaymentsController } from './review/flagged-payments.controller';
import { FlaggedPaymentsService } from './review/flagged-payments.service';
import { PaymentWebhookController } from './webhook/payment-webhook.controller';
import { PaymentWebhookService } from './webhook/payment-webhook.service';
import { PublicPaymentStatusController } from './status/public-payment-status.controller';
import { PublicPaymentStatusService } from './status/public-payment-status.service';
import {
  MERCADO_PAGO_CONFIG,
  readMercadoPagoConfig,
  type MercadoPagoConfig,
} from './mercado-pago-config';

/**
 * Mercado Pago Checkout Pro, its verified payment webhook (#177) and the public payment result
 * (#178), and the admin list of payments flagged for manual review (#230). The config is read once when the app boots (D9): a missing or invalid value stops the
 * boot. `process.env` already holds the repository-root `.env` by then,
 * loaded by `@/database/environment` when the module graph is imported.
 */
@Module({
  imports: [DatabaseModule, IdentityAccessModule, NotificationsModule, PublicRateLimitModule],
  controllers: [
    PublicCheckoutController,
    PaymentWebhookController,
    PublicPaymentStatusController,
    FlaggedPaymentsController,
  ],
  providers: [
    { provide: MERCADO_PAGO_CONFIG, useFactory: () => readMercadoPagoConfig(process.env) },
    { provide: PENDING_PAYMENT_WINDOW, useFactory: () => readPendingPaymentWindow(process.env) },
    { provide: SERVICE_CHARGE, useFactory: () => readServiceCharge(process.env) },
    { provide: EXPIRY_SWEEP_INTERVAL_MS, useFactory: () => readExpirySweepInterval(process.env) },
    PaymentReconciliationSweeper,
    {
      provide: MercadoPagoClient,
      useFactory: (config: MercadoPagoConfig) => new FetchMercadoPagoClient(config),
      inject: [MERCADO_PAGO_CONFIG],
    },
    // Stateless slug lookup shared with the events module's public routes.
    PublicCatalogService,
    PublicCheckoutService,
    PaymentWebhookService,
    PublicPaymentStatusService,
    FlaggedPaymentsService,
  ],
})
export class PaymentsModule {}
