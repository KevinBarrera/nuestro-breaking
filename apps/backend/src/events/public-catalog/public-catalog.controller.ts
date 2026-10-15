import { Controller, Get, Param } from '@nestjs/common';
import { PublicRateLimit } from '@/http';
import { PublicCatalogService } from './public-catalog.service';
import type { PublicEventCatalog } from './public-catalog.types';

/**
 * Public, read-only routes: no session, no CSRF. Rate limited per client IP; CORS for `/public`
 * paths allows only configured origins and never credentials (`src/http`).
 */
@PublicRateLimit()
@Controller('public/events')
export class PublicCatalogController {
  constructor(private readonly catalogs: PublicCatalogService) {}

  @Get(':slug/catalog')
  catalog(@Param('slug') slug: string): Promise<PublicEventCatalog> {
    return this.catalogs.catalog(slug, new Date());
  }
}
