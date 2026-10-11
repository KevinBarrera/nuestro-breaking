import { and, asc, eq, inArray } from 'drizzle-orm';
import type { DatabaseService } from '@/database/database.service';
import {
  activities,
  eventPassTypes,
  eventRegistrationPassSelections,
  eventRegistrationPasses,
} from '@/database/schema';

type Database = DatabaseService['db'];

export interface RegistrationPassSummary {
  name: string;
  priceCents: number;
  /** Selected competition names, ordered by start time then name. */
  competitions: string[];
}

/**
 * The name a buyer is greeted with. Admin manual registrations may only have a display name, so
 * its first word stands in. Shared by the payment result screen (#178) and the email (#179).
 */
export function displayFirstName(firstName: string | null, fullName: string): string {
  return firstName ?? fullName.trim().split(/\s+/)[0];
}

/**
 * A registration's passes in purchase order, each with its selected competitions. Shared by the
 * payment result screen (#178) and the confirmation email (#179), so both list the same thing.
 */
export async function readRegistrationPasses(
  db: Database,
  eventId: string,
  registrationId: string,
): Promise<RegistrationPassSummary[]> {
  const passes = await db
    .select({
      id: eventRegistrationPasses.id,
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
  const selections = passes.length
    ? await db
        .select({
          registrationPassId: eventRegistrationPassSelections.registrationPassId,
          name: activities.name,
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
        )
        .orderBy(asc(activities.startsAt), asc(activities.name))
    : [];

  return passes.map((pass) => ({
    name: pass.name,
    priceCents: pass.priceCents,
    competitions: selections
      .filter((selection) => selection.registrationPassId === pass.id)
      .map((selection) => selection.name),
  }));
}
