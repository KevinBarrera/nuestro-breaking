import { Controller, Get, Query, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { SessionAccessService } from '@/identity-access/session-access.service';
import { CheckInEventListService } from './check-in-event-list.service';

@Controller('admin/events')
export class CheckInEventListController {
  constructor(
    private readonly sessions: SessionAccessService,
    private readonly events: CheckInEventListService,
  ) {}

  /** The events this admin may manage. `?archived=true` also returns archived events. */
  @Get()
  async list(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
    @Query('archived') archived?: unknown,
  ) {
    const scope = await this.sessions.adminEventScope(request, response);
    return this.events.list(scope, archived === 'true');
  }
}
