import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DATABASE_CLIENT } from '@/database/database.constants';
import type { DatabaseService } from '@/database/database.service';
import { eventAdminAudit, events } from '@/database/schema';
import {
  type CreateEventInput,
  type EventFieldError,
  type UpdateEventInput,
  eventWindowErrors,
} from './admin-event-input';
import { type AdminEvent, adminEventColumns, toAdminEvent } from './admin-event.read-model';
import { resolveEventOrganization } from './event-organization';
import { isUniqueViolation } from './unique-violation';

export type EventActor = { userId: string; sessionId: string };
type Transaction = Parameters<Parameters<DatabaseService['db']['transaction']>[0]>[0];

const EDITABLE = ['name', 'timeZone', 'startsAt', 'endsAt'] as const;

const SLUG_CONSTRAINT = 'events_slug_uq';

@Injectable()
export class AdminEventsService {
  constructor(@Inject(DATABASE_CLIENT) private readonly db: DatabaseService['db']) {}

  /**
   * Creates the event in the single organization (#213 D1) with sales disabled and no sales window,
   * and audits `created` in the same transaction. The slug is checked after the organization lock,
   * so a creation that committed first is seen; the unique constraint still catches any other race.
   */
  async create(input: CreateEventInput, actor: EventActor): Promise<AdminEvent> {
    try {
      return await this.db.transaction(async (tx) => {
        const organization = await resolveEventOrganization(tx);
        if (!organization.ok)
          throw conflict('organization_ambiguous', 'More than one organization exists');

        const [taken] = await tx
          .select({ id: events.id })
          .from(events)
          .where(eq(events.slug, input.slug))
          .limit(1);
        if (taken) throw slugTaken();

        const [row] = await tx
          .insert(events)
          .values({
            organizationId: organization.organizationId,
            name: input.name,
            slug: input.slug,
            folioPrefix: input.folioPrefix,
            timeZone: input.timeZone,
            startsAt: input.startsAt,
            endsAt: input.endsAt,
            salesEnabled: false,
            salesOpensAt: null,
            salesClosesAt: null,
          })
          .returning(adminEventColumns);
        const event = toAdminEvent(row);

        await tx.insert(eventAdminAudit).values({
          eventId: event.id,
          eventSlug: event.slug,
          eventName: event.name,
          action: 'created',
          actorUserId: actor.userId,
          actorSessionId: actor.sessionId,
          details: {
            name: event.name,
            slug: event.slug,
            folioPrefix: event.folioPrefix,
            timeZone: event.timeZone,
            startsAt: event.startsAt,
            endsAt: event.endsAt,
            salesEnabled: event.salesEnabled,
          },
        });
        return event;
      });
    } catch (error) {
      if (isUniqueViolation(error, SLUG_CONSTRAINT)) throw slugTaken();
      throw error;
    }
  }

  /**
   * Applies the supplied fields under a row lock. Dates are merged with the stored ones before the
   * window check, so a single date can move as long as the pair stays valid. Archived events are
   * refused with `409 event_archived` so their data stays as archived until restored. When nothing
   * actually changes, the current event is returned and no audit row is written.
   */
  async update(eventId: string, input: UpdateEventInput, actor: EventActor): Promise<AdminEvent> {
    return this.db.transaction(async (tx) => {
      const current = await lockEvent(tx, eventId);
      if (current.archivedAt) throw conflict('event_archived', 'Event is archived');

      const { name, timeZone, startsAt, endsAt } = current;
      const next = { name, timeZone, startsAt, endsAt, ...input };
      const windowErrors = eventWindowErrors(next.startsAt, next.endsAt);
      if (Object.keys(windowErrors).length > 0) throw invalidEvent(windowErrors);

      const changed = EDITABLE.filter((key) => !sameValue(current[key], next[key]));
      if (changed.length === 0) return toAdminEvent(current);

      const [row] = await tx
        .update(events)
        .set(Object.fromEntries(changed.map((key) => [key, next[key]])))
        .where(eq(events.id, eventId))
        .returning(adminEventColumns);
      const before = toAdminEvent(current);
      const after = toAdminEvent(row);
      await tx.insert(eventAdminAudit).values({
        eventId,
        eventSlug: after.slug,
        eventName: after.name,
        action: 'updated',
        actorUserId: actor.userId,
        actorSessionId: actor.sessionId,
        details: {
          before: Object.fromEntries(changed.map((key) => [key, before[key]])),
          after: Object.fromEntries(changed.map((key) => [key, after[key]])),
        },
      });
      return after;
    });
  }
}

/** Reads the event with `FOR UPDATE`, or answers the admin routes' usual `404 Event not found`. */
async function lockEvent(tx: Transaction, eventId: string) {
  const [row] = await tx
    .select(adminEventColumns)
    .from(events)
    .where(eq(events.id, eventId))
    .for('update');
  if (!row) throw new NotFoundException('Event not found');
  return row;
}

function sameValue(a: string | Date | null, b: string | Date | null): boolean {
  if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
  return a === b;
}

/** The `400` for invalid event input, shared by the controller and the merged-date check. */
export function invalidEvent(fieldErrors: Record<string, EventFieldError>) {
  return new BadRequestException({ statusCode: 400, message: 'Invalid event', fieldErrors });
}

function conflict(code: string, message: string, fieldErrors?: Record<string, string>) {
  return new ConflictException({
    statusCode: 409,
    message,
    code,
    ...(fieldErrors && { fieldErrors }),
  });
}

/** A 409 like the team's `email_in_use`, with a field error so the form can mark the slug. */
function slugTaken() {
  return conflict('slug_taken', 'Slug already in use', { slug: 'taken' });
}
