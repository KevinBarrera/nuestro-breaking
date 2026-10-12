import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq, inArray, notExists, sql } from 'drizzle-orm';
import type { AnyPgColumn, PgTable } from 'drizzle-orm/pg-core';
import { DATABASE_CLIENT } from '@/database/database.constants';
import type { DatabaseService } from '@/database/database.service';
import {
  activities,
  eventAdminAudit,
  eventCatalogAudit,
  eventCheckIns,
  eventPassTypes,
  eventRegistrations,
  eventVenues,
  events,
  registrationOperationAudit,
  userRoles,
  venues,
} from '@/database/schema';
import { eventArchived } from '@/events/shared/event-archived';
import { invalidEvent } from './admin-event-errors';
import {
  type CreateEventInput,
  type UpdateEventInput,
  eventWindowErrors,
} from './admin-event-input';
import { type AdminEvent, adminEventColumns, toAdminEvent } from './admin-event.read-model';
import { resolveEventOrganization } from './event-organization';
import { isUniqueViolation } from './unique-violation';

export type EventActor = { userId: string; sessionId: string };
type Transaction = Parameters<Parameters<DatabaseService['db']['transaction']>[0]>[0];

// A record over every key of `UpdateEventInput`, so adding an editable field without listing it here
// (or listing a field the input cannot carry) fails to compile.
const EDITABLE_FIELDS: Record<keyof UpdateEventInput, true> = {
  name: true,
  timeZone: true,
  startsAt: true,
  endsAt: true,
};
const EDITABLE = Object.keys(EDITABLE_FIELDS) as (keyof UpdateEventInput)[];

/** What keeps an event from being deleted (#213 D7), as answered in `409 event_not_empty`. */
export type EventDeleteBlocker =
  'activities' | 'passTypes' | 'registrations' | 'checkIns' | 'catalogAudit' | 'registrationAudit';

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
      if (current.archivedAt) throw eventArchived();

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
      await this.audit(tx, after, 'updated', actor, {
        before: Object.fromEntries(changed.map((key) => [key, before[key]])),
        after: Object.fromEntries(changed.map((key) => [key, after[key]])),
      });
      return after;
    });
  }

  /**
   * Archives the event (#213 D6): sets `archived_at`, turns online sales off and keeps the sales
   * window, so restoring and reopening sales starts from the same dates. The audit keeps the
   * previous switch. Archiving an archived event is `409 event_archived`, like pass types.
   */
  async archive(eventId: string, actor: EventActor): Promise<AdminEvent> {
    return this.db.transaction(async (tx) => {
      const current = await lockEvent(tx, eventId);
      if (current.archivedAt) throw eventArchived();
      const [row] = await tx
        .update(events)
        .set({ archivedAt: sql`now()`, salesEnabled: false })
        .where(eq(events.id, eventId))
        .returning(adminEventColumns);
      const event = toAdminEvent(row);
      await this.audit(tx, event, 'archived', actor, { salesEnabled: current.salesEnabled });
      return event;
    });
  }

  /**
   * Clears `archived_at` and leaves sales off, so an admin reopens them on purpose. Restoring an
   * event that is not archived is `409 event_not_archived`.
   */
  async restore(eventId: string, actor: EventActor): Promise<AdminEvent> {
    return this.db.transaction(async (tx) => {
      const current = await lockEvent(tx, eventId);
      if (!current.archivedAt) throw conflict('event_not_archived', 'Event is not archived');
      const [row] = await tx
        .update(events)
        .set({ archivedAt: null })
        .where(eq(events.id, eventId))
        .returning(adminEventColumns);
      const event = toAdminEvent(row);
      await this.audit(tx, event, 'restored', actor, {
        archivedAt: current.archivedAt.toISOString(),
      });
      return event;
    });
  }

  /**
   * Deletes an empty event (#213 D7). The row lock also blocks new child rows, since their foreign
   * key checks wait for it, so the emptiness check holds until commit. `confirmSlug` must equal the
   * slug exactly. Archived events can be deleted too. The event's venue links go, and so do venues
   * no other event uses; event-scoped `user_roles` go as well (they have no foreign key). The
   * `deleted` audit row has no foreign key to the event, so it outlives it, and the slug is free.
   */
  async delete(eventId: string, confirmSlug: string, actor: EventActor): Promise<void> {
    await this.db.transaction(async (tx) => {
      const current = await lockEvent(tx, eventId);
      if (confirmSlug !== current.slug) throw invalidEvent({ confirmSlug: 'invalid' });

      const blockers = await deleteBlockers(tx, eventId);
      if (blockers.length > 0)
        throw new ConflictException({
          statusCode: 409,
          message: 'Event is not empty',
          code: 'event_not_empty',
          blockers,
        });

      const links = await tx
        .delete(eventVenues)
        .where(eq(eventVenues.eventId, eventId))
        .returning({ venueId: eventVenues.venueId });
      const unused = links.length
        ? await tx
            .delete(venues)
            .where(
              and(
                inArray(
                  venues.id,
                  links.map((link) => link.venueId),
                ),
                notExists(
                  tx
                    .select({ one: sql`1` })
                    .from(eventVenues)
                    .where(eq(eventVenues.venueId, venues.id)),
                ),
              ),
            )
            .returning({ id: venues.id })
        : [];
      const roles = await tx
        .delete(userRoles)
        .where(and(eq(userRoles.scopeType, 'event'), eq(userRoles.scopeId, eventId)))
        .returning({ userId: userRoles.userId, role: userRoles.role });
      await tx.delete(events).where(eq(events.id, eventId));

      await this.audit(tx, toAdminEvent(current), 'deleted', actor, {
        folioPrefix: current.folioPrefix,
        archivedAt: current.archivedAt?.toISOString() ?? null,
        venues: unused.map((venue) => venue.id),
        eventRoles: roles,
      });
    });
  }

  private async audit(
    tx: Transaction,
    event: AdminEvent,
    action: 'updated' | 'archived' | 'restored' | 'deleted',
    actor: EventActor,
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

/** Every kind of row that makes the event non-empty, in a fixed order. */
async function deleteBlockers(tx: Transaction, eventId: string): Promise<EventDeleteBlocker[]> {
  const has = (table: PgTable, column: AnyPgColumn) =>
    sql<boolean>`exists (select 1 from ${table} where ${column} = ${eventId})`;
  const [row] = await tx
    .select({
      activities: has(activities, activities.eventId),
      passTypes: has(eventPassTypes, eventPassTypes.eventId),
      registrations: has(eventRegistrations, eventRegistrations.eventId),
      checkIns: has(eventCheckIns, eventCheckIns.eventId),
      catalogAudit: has(eventCatalogAudit, eventCatalogAudit.eventId),
      registrationAudit: has(registrationOperationAudit, registrationOperationAudit.eventId),
    })
    .from(events)
    .where(eq(events.id, eventId));
  return (Object.keys(row) as EventDeleteBlocker[]).filter((kind) => row[kind]);
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
