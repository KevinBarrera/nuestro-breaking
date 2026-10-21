import { Controller, Get, Param, ParseUUIDPipe, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { SessionAccessService } from '@/identity-access/session-access.service';
import { AttendeeListsService } from './attendee-lists.service';
import type { AttendeeLists } from './attendee-lists.types';

/** Read-only, contact-free attendee lists the event administrator prints as a fallback (#65). */
@Controller('admin/events')
export class AttendeeListsController {
  constructor(
    private readonly sessions: SessionAccessService,
    private readonly attendeeLists: AttendeeListsService,
  ) {}

  @Get(':eventId/attendee-lists')
  async read(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<AttendeeLists> {
    await this.sessions.authorizeEventAdmin(request, response, eventId);
    return this.attendeeLists.read(eventId);
  }
}
