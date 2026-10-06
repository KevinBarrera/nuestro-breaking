import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, eq } from 'drizzle-orm';
import { DATABASE_CLIENT } from '@/database/database.constants';
import type { DatabaseService } from '@/database/database.service';
import { activities, eventCatalogAudit, events, eventVenues } from '@/database/schema';
import type {
  ActivityChanges,
  ActivityDraft,
  ActivityStatus,
  AdminActivity,
  CatalogActor,
} from './activity-admin.types';

type Database = DatabaseService['db'];
type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];
type ActivityRow = typeof activities.$inferSelect;

function toActivity(row: ActivityRow): AdminActivity {
  return {
    id: row.id,
    eventId: row.eventId,
    venueId: row.venueId,
    kind: row.kind,
    name: row.name,
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
    status: row.status as ActivityStatus,
    version: row.version,
  };
}

@Injectable()
export class ActivityAdminService {
  constructor(@Inject(DATABASE_CLIENT) private readonly db: Database) {}

  async list(eventId: string): Promise<AdminActivity[]> {
    const rows = await this.db
      .select()
      .from(activities)
      .where(eq(activities.eventId, eventId))
      .orderBy(asc(activities.startsAt), asc(activities.name), asc(activities.id));
    return rows.map(toActivity);
  }

  async create(eventId: string, draft: ActivityDraft, actor: CatalogActor) {
    return this.db.transaction(async (tx) => {
      await this.assertPlacement(tx, eventId, draft);
      const [row] = await tx
        .insert(activities)
        .values({ eventId, ...draft })
        .returning();
      const after = toActivity(row);
      await this.audit(tx, eventId, actor, 'create', null, after);
      return after;
    });
  }

  async update(eventId: string, activityId: string, changes: ActivityChanges, actor: CatalogActor) {
    return this.db.transaction(async (tx) => {
      const { expectedVersion, ...fields } = changes;
      const current = await this.lockEditable(tx, eventId, activityId, expectedVersion);
      await this.assertPlacement(tx, eventId, { ...current, ...fields });
      const [row] = await tx
        .update(activities)
        .set({ ...fields, version: current.version + 1 })
        .where(and(eq(activities.id, activityId), eq(activities.eventId, eventId)))
        .returning();
      const after = toActivity(row);
      await this.audit(tx, eventId, actor, 'update', toActivity(current), after);
      return after;
    });
  }

  async archive(eventId: string, activityId: string, expectedVersion: number, actor: CatalogActor) {
    return this.db.transaction(async (tx) => {
      const current = await this.lockEditable(tx, eventId, activityId, expectedVersion);
      const [row] = await tx
        .update(activities)
        .set({ status: 'archived', version: current.version + 1 })
        .where(and(eq(activities.id, activityId), eq(activities.eventId, eventId)))
        .returning();
      const after = toActivity(row);
      await this.audit(tx, eventId, actor, 'archive', toActivity(current), after);
      return after;
    });
  }

  // Row lock serializes concurrent edits so the version check and increment cannot interleave.
  private async lockEditable(
    tx: Transaction,
    eventId: string,
    activityId: string,
    expectedVersion: number,
  ): Promise<ActivityRow> {
    const [current] = await tx
      .select()
      .from(activities)
      .where(and(eq(activities.id, activityId), eq(activities.eventId, eventId)))
      .for('update');
    if (!current) throw new NotFoundException('Activity not found');
    if (current.status === 'archived') throw new ConflictException('Activity is archived');
    if (current.version !== expectedVersion)
      throw new ConflictException('Activity version conflict');
    return current;
  }

  // Database constraints remain the backstop; these checks turn expected input errors into 400s.
  private async assertPlacement(tx: Transaction, eventId: string, draft: ActivityDraft) {
    if (draft.startsAt.getTime() >= draft.endsAt.getTime())
      throw new BadRequestException('Invalid activity window');
    const [venue] = await tx
      .select({ venueId: eventVenues.venueId })
      .from(eventVenues)
      .where(and(eq(eventVenues.eventId, eventId), eq(eventVenues.venueId, draft.venueId)));
    if (!venue) throw new BadRequestException('Invalid venue');
    const [event] = await tx
      .select({ startsAt: events.startsAt, endsAt: events.endsAt })
      .from(events)
      .where(eq(events.id, eventId));
    if (
      event?.startsAt &&
      event.endsAt &&
      (draft.startsAt < event.startsAt || draft.endsAt > event.endsAt)
    )
      throw new BadRequestException('Invalid activity window');
  }

  private async audit(
    tx: Transaction,
    eventId: string,
    actor: CatalogActor,
    operation: 'create' | 'update' | 'archive',
    before: AdminActivity | null,
    after: AdminActivity,
  ) {
    await tx.insert(eventCatalogAudit).values({
      eventId,
      actorUserId: actor.userId,
      actorSessionId: actor.sessionId,
      entityType: 'activity',
      entityId: after.id,
      operation,
      before,
      after,
    });
  }
}
