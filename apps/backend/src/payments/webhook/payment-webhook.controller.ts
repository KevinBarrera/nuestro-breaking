import {
  Body,
  Controller,
  Headers,
  HttpCode,
  Inject,
  Post,
  Query,
  UnauthorizedException,
} from '@nestjs/common';
import { MERCADO_PAGO_CONFIG, type MercadoPagoConfig } from '@/payments/mercado-pago-config';
import { PaymentWebhookService } from './payment-webhook.service';
import { verifyWebhookSignature } from './webhook-signature';

/**
 * Mercado Pago payment notifications (#177 D11). Not rate limited: Mercado Pago retries in bursts,
 * and an unsigned request is refused before any work. Only `data.id` is signed. The unsigned body
 * notification `id` is stored as the idempotency claim key, but it never drives state: the payment
 * is always re-read by the signed `data.id`.
 */
@Controller('public/payments/mercado-pago')
export class PaymentWebhookController {
  constructor(
    @Inject(MERCADO_PAGO_CONFIG) private readonly config: MercadoPagoConfig,
    private readonly webhooks: PaymentWebhookService,
  ) {}

  @Post('webhook')
  @HttpCode(200)
  async receive(
    @Headers('x-signature') signatureHeader: string | undefined,
    @Headers('x-request-id') requestId: string | undefined,
    @Query() query: Record<string, unknown>,
    @Body() body: unknown,
  ): Promise<{ received: true }> {
    const fields =
      typeof body === 'object' && body !== null ? (body as Record<string, unknown>) : {};
    const data = typeof fields.data === 'object' && fields.data !== null ? fields.data : {};
    // Mercado Pago signs the query's `data.id`; the body copy is only a fallback.
    const dataId = text(query['data.id']) ?? text((data as Record<string, unknown>).id);
    const verified = verifyWebhookSignature({
      signatureHeader,
      requestId,
      dataId,
      secret: this.config.webhookSecret,
    });
    if (!verified) throw new UnauthorizedException();
    await this.webhooks.handle({
      notificationId: text(fields.id),
      type: text(fields.type) ?? text(query.type),
      dataId,
    });
    return { received: true };
  }
}

function text(value: unknown): string | undefined {
  if (typeof value === 'number' && Number.isSafeInteger(value)) return String(value);
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}
