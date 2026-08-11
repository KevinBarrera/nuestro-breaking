import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq } from 'drizzle-orm';
import { DATABASE_CLIENT } from '@/database/database.constants';
import { events, organizations, venues } from '@/database/schema';
import type { DatabaseService } from '@/database/database.service';
import type {
  EventOrganizationReadPort,
  EventOrganizationView,
} from '@/modules/event-organization/application/event-organization-read.service';

@Injectable()
export class EventOrganizationReadRepository implements EventOrganizationReadPort {
  constructor(
    @Inject(DATABASE_CLIENT)
    private readonly database: DatabaseService['db'],
  ) {}

  async findOrganizationView(organizationId: string): Promise<EventOrganizationView | undefined> {
    const [organization] = await this.database
      .select({ id: organizations.id, name: organizations.name })
      .from(organizations)
      .where(eq(organizations.id, organizationId));

    if (!organization) {
      return undefined;
    }

    const rows = await this.database
      .select({
        id: events.id,
        name: events.name,
        lifecycle: events.lifecycle,
        venue: { id: venues.id, name: venues.name },
        startsAt: events.startsAt,
        endsAt: events.endsAt,
      })
      .from(events)
      .innerJoin(
        venues,
        and(eq(events.venueId, venues.id), eq(events.organizationId, venues.organizationId)),
      )
      .where(
        and(eq(events.organizationId, organizationId), eq(venues.organizationId, organizationId)),
      )
      .orderBy(asc(events.startsAt));

    return {
      organization,
      events: rows.map(({ startsAt, endsAt, ...event }) => ({
        ...event,
        schedule: { startsAt, endsAt },
      })),
    };
  }
}
