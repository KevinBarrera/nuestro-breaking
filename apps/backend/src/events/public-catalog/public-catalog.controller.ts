import { Controller, Get, Param } from '@nestjs/common';
import { PublicCatalogService } from './public-catalog.service';
import type { PublicEventCatalog } from './public-catalog.types';

/** Public, read-only routes: no session, no CSRF. Rate limiting and CORS land in T3 of #175. */
@Controller('public/events')
export class PublicCatalogController {
  constructor(private readonly catalogs: PublicCatalogService) {}

  @Get(':slug/catalog')
  catalog(@Param('slug') slug: string): Promise<PublicEventCatalog> {
    return this.catalogs.catalog(slug, new Date());
  }
}
