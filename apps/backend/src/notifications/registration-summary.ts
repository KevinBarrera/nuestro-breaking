import { and, asc, eq, inArray } from 'drizzle-orm';
import type { DatabaseService } from '@/database/database.service';
import type { ActivityKind } from '@/database/schema/activities';
import {
  activities,
  eventPassTypeActivities,
  eventPassTypes,
  eventRegistrationPassSelections,
  eventRegistrationPasses,
} from '@/database/schema';

type Database = DatabaseService['db'];

export interface PassActivitySummary {
  name: string;
  kind: ActivityKind;
}

export interface RegistrationPassSummary {
  name: string;
  priceCents: number;
  /**
   * The pass's included (active only) and selected activities together, each once, ordered by
   * start time then name (#404).
   */
  activities: PassActivitySummary[];
}

/**
 * The name a buyer is greeted with. Admin manual registrations may only have a display name, so
 * its first word stands in. Shared by the payment result screen (#178) and the email (#179).
 */
export function displayFirstName(firstName: string | null, fullName: string): string {
  return firstName ?? fullName.trim().split(/\s+/)[0];
}

/**
 * A registration's passes in purchase order, each with its activities. Shared by the payment
 * result screen (#178) and the confirmation email (#179), so both list the same thing. Included
 * activities come from the pass type's current links, as on the review step and the admin detail.
 */
export async function readRegistrationPasses(
  db: Database,
  eventId: string,
  registrationId: string,
): Promise<RegistrationPassSummary[]> {
  const passes = await db
    .select({
      id: eventRegistrationPasses.id,
      passTypeId: eventRegistrationPasses.passTypeId,
      name: eventPassTypes.name,
      priceCents: eventRegistrationPasses.priceCents,
    })
    .from(eventRegistrationPasses)
    .innerJoin(eventPassTypes, eq(eventPassTypes.id, eventRegistrationPasses.passTypeId))
    .where(
      and(
        eq(eventRegistrationPasses.eventId, eventId),
        eq(eventRegistrationPasses.eventRegistrationId, registrationId),
      ),
    )
    .orderBy(asc(eventRegistrationPasses.createdAt), asc(eventRegistrationPasses.id));
  if (passes.length === 0) return [];

  const activity = {
    id: activities.id,
    name: activities.name,
    kind: activities.kind,
    startsAt: activities.startsAt,
  };
  const [selections, included] = await Promise.all([
    db
      .select({
        registrationPassId: eventRegistrationPassSelections.registrationPassId,
        ...activity,
      })
      .from(eventRegistrationPassSelections)
      .innerJoin(activities, eq(activities.id, eventRegistrationPassSelections.activityId))
      .where(
        and(
          eq(eventRegistrationPassSelections.eventId, eventId),
          inArray(
            eventRegistrationPassSelections.registrationPassId,
            passes.map((pass) => pass.id),
          ),
        ),
      ),
    db
      .select({ passTypeId: eventPassTypeActivities.passTypeId, ...activity })
      .from(eventPassTypeActivities)
      .innerJoin(
        activities,
        and(
          eq(activities.eventId, eventPassTypeActivities.eventId),
          eq(activities.id, eventPassTypeActivities.activityId),
          eq(activities.status, 'active'),
        ),
      )
      .where(
        and(
          eq(eventPassTypeActivities.eventId, eventId),
          eq(eventPassTypeActivities.access, 'included'),
          inArray(
            eventPassTypeActivities.passTypeId,
            passes.map((pass) => pass.passTypeId),
          ),
        ),
      ),
  ]);

  return passes.map((pass) => {
    const byId = new Map<string, (typeof selections)[number] | (typeof included)[number]>();
    for (const row of included) if (row.passTypeId === pass.passTypeId) byId.set(row.id, row);
    for (const row of selections) if (row.registrationPassId === pass.id) byId.set(row.id, row);
    return {
      name: pass.name,
      priceCents: pass.priceCents,
      activities: [...byId.values()]
        .sort(
          (a, b) =>
            a.startsAt.getTime() - b.startsAt.getTime() || a.name.localeCompare(b.name, 'es'),
        )
        .map(({ name, kind }) => ({ name, kind })),
    };
  });
}
