import { Body, Controller, Param, ParseUUIDPipe, Patch, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { SessionAccessService } from '@/identity-access/session-access.service';
import { type AdminVenue, VenueAdminService, invalidVenue } from './venue-admin.service';
import { parseCreateVenueInput, parseUpdateVenueInput } from './venue-input';

/**
 * An event's venues (#213 D8), for global admins and admins scoped to the event, with Origin and
 * CSRF checks. The list is `venues` in `GET /admin/events/:eventId/foundation`; there is no delete
 * (an empty event's venues go with it).
 */
@Controller('admin/events')
export class VenueAdminController {
  constructor(
    private readonly sessions: SessionAccessService,
    private readonly venues: VenueAdminService,
  ) {}

  /**
   * Body: `{ name }`. Answers `201 { id, name }`. Invalid input is `400 { message: "Invalid venue",
   * fieldErrors }`, an archived event `409 { code: "event_archived" }`, an unknown one `404`.
   */
  @Post(':eventId/venues')
  async create(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
    @Body() body: unknown,
  ): Promise<AdminVenue> {
    const actor = await this.sessions.authorizeEventAdminMutation(request, response, eventId);
    const parsed = parseCreateVenueInput(body);
    if (!parsed.ok) throw invalidVenue(parsed.fieldErrors);
    return this.venues.create(eventId, parsed.value, actor);
  }

  /**
   * Body: `{ name }`. Answers `200 { id, name }`. A venue not linked to the event is `404 Venue not
   * found`; one also linked to another event is `409 { code: "venue_shared" }`.
   */
  @Patch(':eventId/venues/:venueId')
  async update(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Param('venueId', ParseUUIDPipe) venueId: string,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
    @Body() body: unknown,
  ): Promise<AdminVenue> {
    const actor = await this.sessions.authorizeEventAdminMutation(request, response, eventId);
    const parsed = parseUpdateVenueInput(body);
    if (!parsed.ok) throw invalidVenue(parsed.fieldErrors);
    return this.venues.update(eventId, venueId, parsed.value, actor);
  }
}
