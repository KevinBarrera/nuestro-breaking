import { BadRequestException, Body, Controller, HttpCode, Param, Post } from '@nestjs/common';
import { PublicRateLimit } from '@/http';
import { PublicCatalogService } from '@/events/public-catalog';
import { parsePublicRegistrationRequest } from './public-registration-request';
import { PublicRegistrationService } from './public-registration.service';
import type { PublicRegistrationResult } from './public-registration.types';

/**
 * Public registration (#174): no session, no CSRF, rate limited per client IP; CORS for `/public`
 * paths allows only configured origins and never credentials (`src/http`).
 */
@PublicRateLimit()
@Controller('public/events')
export class PublicRegistrationController {
  constructor(
    private readonly catalogs: PublicCatalogService,
    private readonly registrations: PublicRegistrationService,
  ) {}

  @Post(':slug/registrations')
  @HttpCode(201)
  async register(
    @Param('slug') slug: string,
    @Body() body: unknown,
  ): Promise<PublicRegistrationResult> {
    const now = new Date();
    // UTC date: never earlier than the buyer's local date in Mexico, so no valid date is refused.
    const parsed = parsePublicRegistrationRequest(body, now.toISOString().slice(0, 10));
    if (!parsed.ok)
      throw new BadRequestException({
        statusCode: 400,
        message: 'Invalid registration',
        fieldErrors: parsed.fieldErrors,
      });
    const { eventId } = await this.catalogs.requireOpen(slug, now);
    // #180 adds legal acceptance (terms and privacy notice) to this request and stores it with
    // the registration in the same transaction.
    return this.registrations.register(eventId, parsed.value);
  }
}
