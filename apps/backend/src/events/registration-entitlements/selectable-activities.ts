import { and, eq, inArray } from 'drizzle-orm';
import type { DatabaseService } from '@/database/database.service';
import { activities, eventPassTypeActivities } from '@/database/schema';

type Transaction = Parameters<Parameters<DatabaseService['db']['transaction']>[0]>[0];

/**
 * True when every activity is active and `selectable` for this pass type in the same event. The
 * activities are share-locked so a concurrent archive cannot slip in before commit. Shared by
 * admin selection changes and public registration (#174); `activityIds` must be unique.
 */
export async function areSelectableActivities(
  tx: Transaction,
  eventId: string,
  passTypeId: string,
  activityIds: readonly string[],
): Promise<boolean> {
  if (activityIds.length === 0) return true;
  const usable = await tx
    .select({ id: activities.id })
    .from(eventPassTypeActivities)
    .innerJoin(
      activities,
      and(
        eq(activities.eventId, eventPassTypeActivities.eventId),
        eq(activities.id, eventPassTypeActivities.activityId),
      ),
    )
    .where(
      and(
        eq(eventPassTypeActivities.eventId, eventId),
        eq(eventPassTypeActivities.passTypeId, passTypeId),
        eq(eventPassTypeActivities.access, 'selectable'),
        eq(activities.status, 'active'),
        inArray(activities.id, [...activityIds]),
      ),
    )
    .for('share', { of: activities });
  return usable.length === activityIds.length;
}
