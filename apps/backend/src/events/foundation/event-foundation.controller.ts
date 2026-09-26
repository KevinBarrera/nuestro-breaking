import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { EventFoundationService } from './event-foundation.service';
import { type EventFoundation } from './event-foundation.types';

@Controller('admin/events')
export class EventFoundationController {
  constructor(private readonly foundation: EventFoundationService) {}

  @Get(':eventId/foundation')
  getFoundation(@Param('eventId', ParseUUIDPipe) eventId: string): Promise<EventFoundation> {
    return this.foundation.getFoundation(eventId);
  }
}
