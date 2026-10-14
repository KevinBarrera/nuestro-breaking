import { Controller, Get, Param, ParseUUIDPipe, Req, Res } from '@nestjs/common';
import type { Request, Response } from 'express';
import { SessionAccessService } from '@/identity-access/session-access.service';
import { FlaggedPaymentsService } from './flagged-payments.service';
import type { FlaggedPayments } from './flagged-payments.types';

/** Read-only list of the event's Mercado Pago payments flagged for manual review (#230). */
@Controller('admin/events')
export class FlaggedPaymentsController {
  constructor(
    private readonly sessions: SessionAccessService,
    private readonly flaggedPayments: FlaggedPaymentsService,
  ) {}

  @Get(':eventId/flagged-payments')
  async list(
    @Param('eventId', ParseUUIDPipe) eventId: string,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<FlaggedPayments> {
    await this.sessions.authorizeEventAdmin(request, response, eventId);
    return this.flaggedPayments.list(eventId);
  }
}
