import { Controller, Get, NotFoundException, Param } from '@nestjs/common';
import { EventOrganizationReadService } from './application/event-organization-read.service';

@Controller('organizations')
export class EventOrganizationController {
  constructor(private readonly eventOrganizationReadService: EventOrganizationReadService) {}

  @Get(':organizationId/events')
  async listOrganizationEvents(@Param('organizationId') organizationId: string) {
    const view = await this.eventOrganizationReadService.listOrganizationEvents(organizationId);

    if (!view) {
      throw new NotFoundException('Organization not found.');
    }

    return view;
  }
}
