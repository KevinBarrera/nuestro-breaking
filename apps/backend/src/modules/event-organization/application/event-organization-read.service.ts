import { Inject, Injectable } from '@nestjs/common';
import { EventOrganizationReadRepository } from '@/modules/event-organization/infrastructure/event-organization-read.repository';

export type EventOrganizationView = {
  organization: { id: string; name: string };
  events: Array<{
    id: string;
    name: string;
    venue: { id: string; name: string };
    schedule: { startsAt: Date; endsAt: Date | null };
  }>;
};

export interface EventOrganizationReadPort {
  findOrganizationView(organizationId: string): Promise<EventOrganizationView | undefined>;
}

@Injectable()
export class EventOrganizationReadService {
  constructor(
    @Inject(EventOrganizationReadRepository)
    private readonly repository: EventOrganizationReadPort,
  ) {}

  listOrganizationEvents(organizationId: string): Promise<EventOrganizationView | undefined> {
    return this.repository.findOrganizationView(organizationId);
  }
}
