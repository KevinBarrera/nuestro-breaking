import { BadRequestException, Body, Controller, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { SessionAccessService } from '@/identity-access/session-access.service';
import { parseCreateEventInput } from './admin-event-input';
import type { AdminEvent } from './admin-event.read-model';
import { AdminEventsService } from './admin-events.service';

/** Event lifecycle from the admin panel (#213). Creating an event is limited to global admins. */
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
    if (!parsed.ok)
      throw new BadRequestException({
        statusCode: 400,
        message: 'Invalid event',
        fieldErrors: parsed.fieldErrors,
      });
    return this.adminEvents.create(parsed.value, actor);
  }
}
