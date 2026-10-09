import { Controller, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { PublicRateLimit } from '@/http';
import { PublicCatalogService } from '@/events/public-catalog';
import { PublicCheckoutService } from './public-checkout.service';

/**
 * Public Checkout Pro start (#177 D8): no session, no CSRF, rate limited per client IP, like the
 * other public routes. The browser follows `checkoutUrl` to Mercado Pago's hosted page; only the
 * verified webhook confirms the registration.
 */
@PublicRateLimit()
@Controller('public/events')
export class PublicCheckoutController {
  constructor(
    private readonly catalogs: PublicCatalogService,
    private readonly checkouts: PublicCheckoutService,
  ) {}

  @Post(':slug/registrations/:registrationId/checkout')
  @HttpCode(201)
  async checkout(
    @Param('slug') slug: string,
    @Param('registrationId', ParseUUIDPipe) registrationId: string,
  ): Promise<{ checkoutUrl: string }> {
    const event = await this.catalogs.requireOpen(slug, new Date());
    return this.checkouts.createCheckout(event.eventId, event.slug, registrationId);
  }
}
