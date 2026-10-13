import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, eq, ne } from 'drizzle-orm';
import { DATABASE_CLIENT } from '@/database/database.constants';
import type { DatabaseService } from '@/database/database.service';
import { eventAdminAudit, eventVenues, events, venues } from '@/database/schema';
import type { EventAdminAuditAction } from '@/database/schema';
import { eventArchived } from '@/events/shared/event-archived';
import type { VenueInput } from './venue-input';

export type VenueActor = { userId: string; sessionId: string };
/** A venue as the admin API answers it; the same shape the foundation read lists. */
export type AdminVenue = { id: string; name: string };
type Transaction = Parameters<Parameters<DatabaseService['db']['transaction']>[0]>[0];

/** The `400` for invalid venue input, shaped like the event's `Invalid event`. */
export function invalidVenue(fieldErrors: Record<string, string>) {
  return new BadRequestException({ statusCode: 400, message: 'Invalid venue', fieldErrors });
}

/**
 * An event's venues from the admin panel (#213 D8). The list is the foundation read's `venues`, so
 * this service only writes. Every write locks the event row first, refuses archived events with the
 * shared `409 event_archived`, and audits in `event_admin_audit` in the same transaction.
 */
@Injectable()
export class VenueAdminService {
  constructor(@Inject(DATABASE_CLIENT) private readonly db: DatabaseService['db']) {}

  /** Creates the venue in the event's organization and links it to the event. */
  async create(eventId: string, input: VenueInput, actor: VenueActor): Promise<AdminVenue> {
    return this.db.transaction(async (tx) => {
      const event = await lockWritableEvent(tx, eventId);
      const [venue] = await tx
        .insert(venues)
        .values({ organizationId: event.organizationId, name: input.name })
        .returning({ id: venues.id, name: venues.name });
      await tx
        .insert(eventVenues)
        .values({ organizationId: event.organizationId, eventId, venueId: venue.id });
      await audit(tx, event, 'venue_created', actor, {
        venueId: venue.id,
        after: { name: venue.name },
      });
      return venue;
    });
  }

  /**
   * Renames a venue linked to this event. A venue also linked to another event is refused with
   * `409 venue_shared`, so one event's admin cannot rename another event's venue (the November seed
   * shares none; only SQL can share one). An unchanged name answers 200 without an audit row.
   */
  async update(
    eventId: string,
    venueId: string,
    input: VenueInput,
    actor: VenueActor,
  ): Promise<AdminVenue> {
    return this.db.transaction(async (tx) => {
      const event = await lockWritableEvent(tx, eventId);
      const [current] = await tx
        .select({ id: venues.id, name: venues.name })
        .from(venues)
        .innerJoin(eventVenues, eq(eventVenues.venueId, venues.id))
        .where(and(eq(eventVenues.eventId, eventId), eq(venues.id, venueId)))
        .for('update', { of: venues });
      if (!current) throw new NotFoundException('Venue not found');

      const [shared] = await tx
        .select({ eventId: eventVenues.eventId })
        .from(eventVenues)
        .where(and(eq(eventVenues.venueId, venueId), ne(eventVenues.eventId, eventId)))
        .limit(1);
      if (shared)
        throw new ConflictException({
          statusCode: 409,
          message: 'Venue is shared with another event',
          code: 'venue_shared',
        });

      if (current.name === input.name) return current;
      const [venue] = await tx
        .update(venues)
        .set({ name: input.name })
        .where(eq(venues.id, venueId))
        .returning({ id: venues.id, name: venues.name });
      await audit(tx, event, 'venue_updated', actor, {
        venueId,
        before: { name: current.name },
        after: { name: venue.name },
      });
      return venue;
    });
  }
}

/**
 * Reads the event with `FOR UPDATE` (so a concurrent delete or archive waits), answering the admin
 * routes' `404 Event not found` or the shared `409 event_archived`.
 */
async function lockWritableEvent(tx: Transaction, eventId: string) {
  const [event] = await tx
    .select({
      id: events.id,
      organizationId: events.organizationId,
      slug: events.slug,
      name: events.name,
      archivedAt: events.archivedAt,
    })
    .from(events)
    .where(eq(events.id, eventId))
    .for('update');
  if (!event) throw new NotFoundException('Event not found');
  if (event.archivedAt) throw eventArchived();
  return event;
}

async function audit(
  tx: Transaction,
  event: { id: string; slug: string; name: string },
  action: Extract<EventAdminAuditAction, `venue_${string}`>,
  actor: VenueActor,
  details: Record<string, unknown>,
) {
  await tx.insert(eventAdminAudit).values({
    eventId: event.id,
    eventSlug: event.slug,
    eventName: event.name,
    action,
    actorUserId: actor.userId,
    actorSessionId: actor.sessionId,
    details,
  });
}
