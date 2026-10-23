import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { asc, eq } from 'drizzle-orm';
import { DATABASE_CLIENT } from '@/database/database.constants';
import { type DatabaseService } from '@/database/database.service';
import { activities, eventVenues, events, venues } from '@/database/schema';
import { deleteBlockers } from '@/events/admin-events/event-delete-blockers';
import { type EventFoundation } from './event-foundation.types';

@Injectable()
export class EventFoundationService {
  constructor(@Inject(DATABASE_CLIENT) private readonly db: DatabaseService['db']) {}

  async getFoundation(eventId: string): Promise<EventFoundation> {
    const [event] = await this.db
      .select({
        id: events.id,
        name: events.name,
        slug: events.slug,
        folioPrefix: events.folioPrefix,
        timeZone: events.timeZone,
        startsAt: events.startsAt,
        endsAt: events.endsAt,
        salesEnabled: events.salesEnabled,
        archivedAt: events.archivedAt,
        city: events.city,
        state: events.state,
        country: events.country,
      })
      .from(events)
      .where(eq(events.id, eventId))
      .limit(1);

    if (!event) {
      throw new NotFoundException('Event not found');
    }

    const [attachedVenues, eventActivities, blockers] = await Promise.all([
      this.db
        .select({ id: venues.id, name: venues.name })
        .from(eventVenues)
        .innerJoin(venues, eq(eventVenues.venueId, venues.id))
        .where(eq(eventVenues.eventId, eventId))
        .orderBy(asc(venues.id)),
      this.db
        .select({
          id: activities.id,
          name: activities.name,
          kind: activities.kind,
          venueId: activities.venueId,
          startsAt: activities.startsAt,
          endsAt: activities.endsAt,
        })
        .from(activities)
        .where(eq(activities.eventId, eventId))
        .orderBy(asc(activities.startsAt), asc(activities.id)),
      deleteBlockers(this.db, eventId),
    ]);

    return {
      event: {
        id: event.id,
        name: event.name,
        slug: event.slug,
        folioPrefix: event.folioPrefix,
        timeZone: event.timeZone,
        startsAt: event.startsAt?.toISOString() ?? null,
        endsAt: event.endsAt?.toISOString() ?? null,
        windowStatus: event.startsAt === null && event.endsAt === null ? 'unbounded' : 'bounded',
        salesEnabled: event.salesEnabled,
        archivedAt: event.archivedAt?.toISOString() ?? null,
        city: event.city,
        state: event.state,
        country: event.country,
      },
      venues: attachedVenues,
      activities: eventActivities.map((activity) => ({
        id: activity.id,
        name: activity.name,
        kind: activity.kind,
        venueId: activity.venueId,
        startsAt: activity.startsAt.toISOString(),
        endsAt: activity.endsAt.toISOString(),
        planningStatus: 'draft',
      })),
      deleteBlockers: blockers,
      deferredFields: ['priceDisplay', 'capacity', 'registrationRequirements'],
    };
  }
}
