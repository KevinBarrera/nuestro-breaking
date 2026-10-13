import {
  Body,
  Controller,
  Delete,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { SessionAccessService } from '@/identity-access/session-access.service';
import { invalidEvent } from './admin-event-errors';
import {
  parseCreateEventInput,
  parseDeleteEventInput,
  parseUpdateEventInput,
} from './admin-event-input';
import type { AdminEvent } from './admin-event.read-model';
import { AdminEventsService } from './admin-events.service';

/**
 * Event lifecycle from the admin panel (#213). Creating an event is limited to global admins;
 * editing is open to global admins and admins scoped to the event; archiving, restoring and
 * deleting are limited to global admins.
 */
@Controller('admin/events')
export class AdminEventsController {
  constructor(
    private readonly sessions: SessionAccessService,
    private readonly adminEvents: AdminEventsService,
  ) {}

  /**
   * Body: `{ name, slug, folioPrefix, timeZone, startsAt?, endsAt? }`. Sales start disabled. Invalid
   * fields give `400 { fieldErrors }`, a taken slug `409 { code: "slug_taken", fieldErrors }`, and
   * more than one organization `409 { code: "organization_ambiguous" }`.
   */
  @Post()
  async create(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
    @Body() body: unknown,
  ): Promise<AdminEvent> {
    const actor = await this.sessions.authorizeGlobalAdminMutation(request, response);
    const parsed = parseCreateEventInput(body);
    if (!parsed.ok) throw invalidEvent(parsed.fieldErrors);
    return this.adminEvents.create(parsed.value, actor);
  }

  /**
   * Body: any of `{ name, timeZone, startsAt, endsAt }`. `slug` and `folioPrefix` give the field
   * error `immutable`, other keys `invalid`; supplied dates are merged with the stored ones before
   * the window check (`400 { fieldErrors }`). An archived event is `409 { code: "event_archived" }`,
   * an unknown one `404`. Returns the same event as `POST`.
   */
  @Patch(':eventId')
  async update(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
    @Body() body: unknown,
  ): Promise<AdminEvent> {
    const actor = await this.sessions.authorizeEventAdminMutation(request, response, eventId);
    const parsed = parseUpdateEventInput(body);
    if (!parsed.ok) throw invalidEvent(parsed.fieldErrors);
    return this.adminEvents.update(eventId, parsed.value, actor);
  }

  /**
   * Archives the event and turns sales off; it then drops out of the public catalog, registration
   * and checkout. Already archived is `409 { code: "event_archived" }`. Named and answered
   * (`201`) like the pass type and activity archive routes.
   */
  @Post(':eventId/archive')
  async archive(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AdminEvent> {
    const actor = await this.sessions.authorizeGlobalAdminMutation(request, response);
    return this.adminEvents.archive(eventId, actor);
  }

  /** Restores an archived event with sales still off. Not archived is `409 { code: "event_not_archived" }`. */
  @Post(':eventId/restore')
  async restore(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AdminEvent> {
    const actor = await this.sessions.authorizeGlobalAdminMutation(request, response);
    return this.adminEvents.restore(eventId, actor);
  }

  /**
   * Body: `{ confirmSlug }`, which must equal the event's slug exactly (else `400 { fieldErrors:
   * { confirmSlug: "invalid" } }`). Only an empty event can go: anything else is `409 { code:
   * "event_not_empty", blockers }`. Archived events can be deleted. Answers `204` with no body.
   */
  @Delete(':eventId')
  @HttpCode(204)
  async delete(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
    @Body() body: unknown,
  ): Promise<void> {
    const actor = await this.sessions.authorizeGlobalAdminMutation(request, response);
    const parsed = parseDeleteEventInput(body);
    if (!parsed.ok) throw invalidEvent(parsed.fieldErrors);
    await this.adminEvents.delete(eventId, parsed.value.confirmSlug, actor);
  }
}
