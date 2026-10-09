import { Module } from '@nestjs/common';
import { DatabaseModule } from '@/database/database.module';
import { PublicCatalogService } from '@/events/public-catalog';
import { PublicRateLimitModule } from '@/http';
import { PublicCheckoutController } from './checkout/public-checkout.controller';
import { PublicCheckoutService } from './checkout/public-checkout.service';
import { FetchMercadoPagoClient } from './fetch-mercado-pago-client';
import { MercadoPagoClient } from './mercado-pago-client';
import { PaymentWebhookController } from './webhook/payment-webhook.controller';
import { PaymentWebhookService } from './webhook/payment-webhook.service';
import {
  MERCADO_PAGO_CONFIG,
  readMercadoPagoConfig,
  type MercadoPagoConfig,
} from './mercado-pago-config';

/**
 * Mercado Pago Checkout Pro and its verified payment webhook (#177). The config is read once when the app boots (D9): a missing or
 * invalid value stops the boot. `process.env` already holds the repository-root `.env` by then,
 * loaded by `@/database/environment` when the module graph is imported.
 */
@Module({
  imports: [DatabaseModule, PublicRateLimitModule],
  controllers: [PublicCheckoutController, PaymentWebhookController],
  providers: [
    { provide: MERCADO_PAGO_CONFIG, useFactory: () => readMercadoPagoConfig(process.env) },
    {
      provide: MercadoPagoClient,
      useFactory: (config: MercadoPagoConfig) => new FetchMercadoPagoClient(config),
      inject: [MERCADO_PAGO_CONFIG],
    },
    // Stateless slug lookup shared with the events module's public routes.
    PublicCatalogService,
    PublicCheckoutService,
    PaymentWebhookService,
  ],
})
export class PaymentsModule {}
