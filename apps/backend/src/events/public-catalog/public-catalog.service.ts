import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { DATABASE_CLIENT } from '@/database/database.constants';
import type { DatabaseService } from '@/database/database.service';
import { activities, eventPassTypeActivities, eventPassTypes, events } from '@/database/schema';
import { salesState, type SalesClosedReason } from '@/events/sales';
import { toPublicCatalog } from './public-catalog.projection';
import type { CatalogEventRow, PublicEventCatalog } from './public-catalog.types';

type Database = DatabaseService['db'];

// Same rule as the `events_slug_ck` check; anything else cannot match a row, so it is a 404.
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** Thrown by `requireOpen` when the event exists but sales are closed (409). */
export class SalesClosedException extends ConflictException {
  constructor(readonly reason: SalesClosedReason) {
    super({ statusCode: 409, message: 'Sales are closed', reason });
  }
}

@Injectable()
export class PublicCatalogService {
  constructor(@Inject(DATABASE_CLIENT) private readonly db: Database) {}

  /** The public catalog of the event with this slug. Unknown or malformed slugs are a 404. */
  async catalog(slug: string, now: Date): Promise<PublicEventCatalog> {
    const event = await this.event(slug);
    if (salesState(event, now).state === 'closed') return toPublicCatalog(event, [], [], now);

    const passes = await this.db
      .select({
        id: eventPassTypes.id,
        name: eventPassTypes.name,
        passClass: eventPassTypes.passClass,
        priceCents: eventPassTypes.priceCents,
        requiresPassClass: eventPassTypes.requiresPassClass,
      })
      .from(eventPassTypes)
      .where(and(eq(eventPassTypes.eventId, event.id), eq(eventPassTypes.status, 'active')));
    const links = await this.db
      .select({
        passTypeId: eventPassTypeActivities.passTypeId,
        access: eventPassTypeActivities.access,
        activity: {
          id: activities.id,
          name: activities.name,
          kind: activities.kind,
          startsAt: activities.startsAt,
          endsAt: activities.endsAt,
        },
      })
      .from(eventPassTypeActivities)
      .innerJoin(activities, eq(activities.id, eventPassTypeActivities.activityId))
      .where(and(eq(eventPassTypeActivities.eventId, event.id), eq(activities.status, 'active')));
    return toPublicCatalog(event, passes, links, now);
  }

  /**
   * Reusable guard for public writes such as registration (#174): resolves the event by slug and
   * throws `SalesClosedException` unless sales are open at `now`. Unknown slugs are a 404.
   */
  async requireOpen(slug: string, now: Date): Promise<{ eventId: string; slug: string }> {
    const event = await this.event(slug);
    const state = salesState(event, now);
    if (state.state === 'closed') throw new SalesClosedException(state.reason);
    return { eventId: event.id, slug: event.slug };
  }

  private async event(slug: string): Promise<CatalogEventRow> {
    if (slug.length > 80 || !SLUG.test(slug)) throw new NotFoundException('Event not found');
    const [row] = await this.db
      .select({
        id: events.id,
        slug: events.slug,
        name: events.name,
        timeZone: events.timeZone,
        startsAt: events.startsAt,
        endsAt: events.endsAt,
        salesEnabled: events.salesEnabled,
        salesOpensAt: events.salesOpensAt,
        salesClosesAt: events.salesClosesAt,
      })
      .from(events)
      .where(eq(events.slug, slug));
    if (!row) throw new NotFoundException('Event not found');
    return row;
  }
}
