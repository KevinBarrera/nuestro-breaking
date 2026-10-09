import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { PublicRateLimit } from '@/http';
import { PublicCatalogService } from '@/events/public-catalog';
import { PublicPaymentStatusService } from './public-payment-status.service';
import type { PublicPaymentStatusResponse } from './public-payment-status.types';

/**
 * Public payment result (#178 D3): no session, rate limited per client IP like the other public
 * routes. It keeps answering after sales close, since a buyer may come back from Mercado Pago late.
 */
@PublicRateLimit()
@Controller('public/events')
export class PublicPaymentStatusController {
  constructor(
    private readonly catalogs: PublicCatalogService,
    private readonly statuses: PublicPaymentStatusService,
  ) {}

  @Get(':slug/registrations/:registrationId/payment-status')
  async paymentStatus(
    @Param('slug') slug: string,
    @Param('registrationId', ParseUUIDPipe) registrationId: string,
  ): Promise<PublicPaymentStatusResponse> {
    const event = await this.catalogs.requireEvent(slug);
    return this.statuses.paymentStatus(event.eventId, registrationId);
  }
}
