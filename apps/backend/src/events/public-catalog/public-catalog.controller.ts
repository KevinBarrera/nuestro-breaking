import { Controller, Get, Inject, Param } from '@nestjs/common';
import { SERVICE_CHARGE, type ServiceCharge } from '@/events/shared/service-charge';
import { PublicRateLimit } from '@/http';
import { PublicCatalogService } from './public-catalog.service';
import type { PublicEventCatalogResponse } from './public-catalog.types';

/**
 * Public, read-only routes: no session, no CSRF. Rate limited per client IP; CORS for `/public`
 * paths allows only configured origins and never credentials (`src/http`).
 */
@PublicRateLimit()
@Controller('public/events')
export class PublicCatalogController {
  constructor(
    private readonly catalogs: PublicCatalogService,
    @Inject(SERVICE_CHARGE) private readonly serviceCharge: ServiceCharge,
  ) {}

  @Get(':slug/catalog')
  async catalog(@Param('slug') slug: string): Promise<PublicEventCatalogResponse> {
    const catalog = await this.catalogs.catalog(slug, new Date());
    return { ...catalog, serviceCharge: this.serviceCharge };
  }
}
