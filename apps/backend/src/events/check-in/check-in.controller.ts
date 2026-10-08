import { Controller, Param, ParseUUIDPipe, Post, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { SessionAccessService } from '@/identity-access/session-access.service';
import { CheckInService } from './check-in.service';

@Controller('admin/events')
export class CheckInController {
  constructor(
    private readonly sessions: SessionAccessService,
    private readonly checkIns: CheckInService,
  ) {}

  @Post(':eventId/registrations/:registrationId/activities/:activityId/check-in')
  async createActivity(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Param('registrationId', ParseUUIDPipe) registrationId: string,
    @Param('activityId', ParseUUIDPipe) activityId: string,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const actor = await this.sessions.authorizeEventAdminMutation(request, response, eventId);
    return this.checkIns.createActivity(eventId, registrationId, activityId, actor);
  }

  @Post(':eventId/registrations/:registrationId/check-in')
  async create(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Param('registrationId', ParseUUIDPipe) registrationId: string,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ) {
    const actor = await this.sessions.authorizeEventAdminMutation(request, response, eventId);
    return this.checkIns.create(eventId, registrationId, actor);
  }
}
