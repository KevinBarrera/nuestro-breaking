import { Inject, Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { DATABASE_CLIENT } from '@/database/database.constants';
import { events, venues } from '@/database/schema';
import type { DatabaseService } from '@/database/database.service';
import type { CreateEventInput } from '@/modules/event-organization/application/event-organization.service';

export type EventLifecycle = 'draft' | 'published' | 'closed';
export type EventOrganizationEvent = {
  id: string;
  organizerUserId: string;
  lifecycle: EventLifecycle;
};

@Injectable()
export class EventOrganizationRepository {
  constructor(@Inject(DATABASE_CLIENT) private readonly database: DatabaseService['db']) {}

  async createEvent(input: Omit<CreateEventInput, 'startsAt'> & { startsAt: Date }) {
    const [event] = await this.database
      .insert(events)
      .values({ ...input, lifecycle: 'draft' })
      .returning({ id: events.id });
    return this.findEventById(event.id) as Promise<EventOrganizationEvent>;
  }

  async findEventById(eventId: string): Promise<EventOrganizationEvent | undefined> {
    const [row] = await this.database
      .select()
      .from(events)
      .innerJoin(
        venues,
        and(eq(events.venueId, venues.id), eq(events.organizationId, venues.organizationId)),
      )
      .where(eq(events.id, eventId));
    if (!row) return undefined;
    const { events: event } = row;
    return { ...event, lifecycle: event.lifecycle as EventLifecycle };
  }

  async publishEvent(eventId: string): Promise<EventOrganizationEvent | undefined> {
    await this.database
      .update(events)
      .set({ lifecycle: 'published' })
      .where(eq(events.id, eventId));
    return this.findEventById(eventId);
  }
}
