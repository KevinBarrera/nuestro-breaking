import { ConflictException, Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DATABASE_CLIENT } from '@/database/database.constants';
import type { DatabaseService } from '@/database/database.service';
import { eventAdminAudit, events } from '@/database/schema';
import type { CreateEventInput } from './admin-event-input';
import { type AdminEvent, adminEventColumns, toAdminEvent } from './admin-event.read-model';
import { resolveEventOrganization } from './event-organization';

export type EventActor = { userId: string; sessionId: string };

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

// Drizzle wraps driver errors; the PostgreSQL error may sit on the error itself or on `cause`.
function isUniqueViolation(error: unknown, constraint: string): boolean {
  for (let current = error; current && typeof current === 'object';) {
    const candidate = current as { code?: unknown; constraint_name?: unknown; cause?: unknown };
    if (candidate.code === '23505' && candidate.constraint_name === constraint) return true;
    current = candidate.cause;
  }
  return false;
}
