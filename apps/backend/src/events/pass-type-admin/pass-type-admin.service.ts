import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, asc, eq, inArray, sql } from 'drizzle-orm';
import { DATABASE_CLIENT } from '@/database/database.constants';
import type { DatabaseService } from '@/database/database.service';
import {
  activities,
  eventCatalogAudit,
  eventPassTypeActivities,
  eventPassTypes,
} from '@/database/schema';
import type { CatalogActor } from '@/events/activity-admin/activity-admin.types';
import type {
  AdminPassType,
  PassTypeActivity,
  PassTypeChanges,
  PassTypeDraft,
  PassTypeFields,
  PassTypeStatus,
} from './pass-type-admin.types';

type Database = DatabaseService['db'];
type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];
type Executor = Database | Transaction;
type PassTypeRow = typeof eventPassTypes.$inferSelect;
type Operation = 'create' | 'update' | 'archive' | 'restore' | 'access_change';

const ACTIVE_NAME_INDEX = 'event_pass_types_event_active_name_uq';

function toPassType(row: PassTypeRow, access: PassTypeActivity[]): AdminPassType {
  return {
    id: row.id,
    eventId: row.eventId,
    name: row.name,
    passClass: row.passClass as AdminPassType['passClass'],
    priceCents: row.priceCents,
    requiresPassClass: row.requiresPassClass as AdminPassType['requiresPassClass'],
    status: row.status as AdminPassType['status'],
    version: row.version,
    activities: [...access].sort((left, right) => left.activityId.localeCompare(right.activityId)),
  };
}

// Drizzle wraps driver errors; the PostgreSQL error may sit on the error itself or on `cause`.
function isActiveNameConflict(error: unknown): boolean {
  for (let current = error; current && typeof current === 'object';) {
    const candidate = current as { code?: unknown; constraint_name?: unknown; cause?: unknown };
    if (candidate.code === '23505' && candidate.constraint_name === ACTIVE_NAME_INDEX) return true;
    current = candidate.cause;
  }
  return false;
}

// Only an add-on may require another pass class; the database check stays as the backstop.
function assertClassRule(fields: PassTypeFields) {
  if (fields.requiresPassClass !== null && fields.passClass !== 'add_on')
    throw new BadRequestException('Only add-on passes may require a pass class');
}

@Injectable()
export class PassTypeAdminService {
  constructor(@Inject(DATABASE_CLIENT) private readonly db: Database) {}

  async list(eventId: string): Promise<AdminPassType[]> {
    const rows = await this.db
      .select()
      .from(eventPassTypes)
      .where(eq(eventPassTypes.eventId, eventId))
      .orderBy(asc(eventPassTypes.name), asc(eventPassTypes.id));
    const links = await this.db
      .select({
        passTypeId: eventPassTypeActivities.passTypeId,
        activityId: eventPassTypeActivities.activityId,
        access: eventPassTypeActivities.access,
      })
      .from(eventPassTypeActivities)
      .where(eq(eventPassTypeActivities.eventId, eventId));
    const byPassType = new Map<string, PassTypeActivity[]>();
    for (const link of links) {
      const entries = byPassType.get(link.passTypeId) ?? [];
      entries.push({
        activityId: link.activityId,
        access: link.access as PassTypeActivity['access'],
      });
      byPassType.set(link.passTypeId, entries);
    }
    return rows.map((row) => toPassType(row, byPassType.get(row.id) ?? []));
  }

  async create(eventId: string, draft: PassTypeDraft, actor: CatalogActor) {
    const { activities: access, ...fields } = draft;
    assertClassRule(fields);
    return this.db.transaction(async (tx) => {
      await this.assertActivities(tx, eventId, access);
      const [row] = await this.guardName(() =>
        tx
          .insert(eventPassTypes)
          .values({ eventId, ...fields })
          .returning(),
      );
      await this.writeAccess(tx, eventId, row.id, access);
      const after = toPassType(row, access);
      await this.audit(tx, eventId, actor, 'create', null, after);
      return after;
    });
  }

  async update(eventId: string, passTypeId: string, changes: PassTypeChanges, actor: CatalogActor) {
    return this.db.transaction(async (tx) => {
      const { expectedVersion, ...fields } = changes;
      const current = await this.lockEditable(tx, eventId, passTypeId, expectedVersion);
      assertClassRule({
        name: fields.name ?? current.name,
        passClass: fields.passClass ?? (current.passClass as PassTypeFields['passClass']),
        priceCents: fields.priceCents ?? current.priceCents,
        requiresPassClass:
          fields.requiresPassClass !== undefined
            ? fields.requiresPassClass
            : (current.requiresPassClass as PassTypeFields['requiresPassClass']),
      });
      const access = await this.readAccess(tx, eventId, passTypeId);
      const [row] = await this.guardName(() =>
        tx
          .update(eventPassTypes)
          .set({ ...fields, version: current.version + 1, updatedAt: sql`now()` })
          .where(and(eq(eventPassTypes.id, passTypeId), eq(eventPassTypes.eventId, eventId)))
          .returning(),
      );
      const after = toPassType(row, access);
      await this.audit(tx, eventId, actor, 'update', toPassType(current, access), after);
      return after;
    });
  }

  async replaceActivities(
    eventId: string,
    passTypeId: string,
    expectedVersion: number,
    access: PassTypeActivity[],
    actor: CatalogActor,
  ) {
    return this.db.transaction(async (tx) => {
      const current = await this.lockEditable(tx, eventId, passTypeId, expectedVersion);
      await this.assertActivities(tx, eventId, access);
      const previous = await this.readAccess(tx, eventId, passTypeId);
      await tx
        .delete(eventPassTypeActivities)
        .where(
          and(
            eq(eventPassTypeActivities.eventId, eventId),
            eq(eventPassTypeActivities.passTypeId, passTypeId),
          ),
        );
      await this.writeAccess(tx, eventId, passTypeId, access);
      const [row] = await tx
        .update(eventPassTypes)
        .set({ version: current.version + 1, updatedAt: sql`now()` })
        .where(and(eq(eventPassTypes.id, passTypeId), eq(eventPassTypes.eventId, eventId)))
        .returning();
      const after = toPassType(row, access);
      await this.audit(tx, eventId, actor, 'access_change', toPassType(current, previous), after);
      return after;
    });
  }

  async archive(eventId: string, passTypeId: string, expectedVersion: number, actor: CatalogActor) {
    return this.db.transaction(async (tx) => {
      const current = await this.lockEditable(tx, eventId, passTypeId, expectedVersion);
      const access = await this.readAccess(tx, eventId, passTypeId);
      const [row] = await tx
        .update(eventPassTypes)
        .set({ status: 'archived', version: current.version + 1, updatedAt: sql`now()` })
        .where(and(eq(eventPassTypes.id, passTypeId), eq(eventPassTypes.eventId, eventId)))
        .returning();
      const after = toPassType(row, access);
      await this.audit(tx, eventId, actor, 'archive', toPassType(current, access), after);
      return after;
    });
  }

  // Access links survive archive untouched, so the restored pass type keeps exactly the access it
  // had, including links to activities archived meanwhile. Held passes are never rewritten.
  async restore(eventId: string, passTypeId: string, expectedVersion: number, actor: CatalogActor) {
    return this.db.transaction(async (tx) => {
      const current = await this.lock(tx, eventId, passTypeId, expectedVersion, 'archived');
      const access = await this.readAccess(tx, eventId, passTypeId);
      const [row] = await this.guardName(
        () =>
          tx
            .update(eventPassTypes)
            .set({ status: 'active', version: current.version + 1, updatedAt: sql`now()` })
            .where(and(eq(eventPassTypes.id, passTypeId), eq(eventPassTypes.eventId, eventId)))
            .returning(),
        'An active pass type with this name already exists; rename one of them before restoring',
      );
      const after = toPassType(row, access);
      await this.audit(tx, eventId, actor, 'restore', toPassType(current, access), after);
      return after;
    });
  }

  private lockEditable(tx: Transaction, eventId: string, passTypeId: string, version: number) {
    return this.lock(tx, eventId, passTypeId, version, 'active');
  }

  // Row lock serializes concurrent edits so the version check and increment cannot interleave.
  private async lock(
    tx: Transaction,
    eventId: string,
    passTypeId: string,
    expectedVersion: number,
    status: PassTypeStatus,
  ): Promise<PassTypeRow> {
    const [current] = await tx
      .select()
      .from(eventPassTypes)
      .where(and(eq(eventPassTypes.id, passTypeId), eq(eventPassTypes.eventId, eventId)))
      .for('update');
    if (!current) throw new NotFoundException('Pass type not found');
    if (current.status !== status)
      throw new ConflictException(
        status === 'active' ? 'Pass type is archived' : 'Pass type is not archived',
      );
    if (current.version !== expectedVersion)
      throw new ConflictException('Pass type version conflict');
    return current;
  }

  // Share-locks the referenced activities so a concurrent archive cannot slip in before commit.
  private async assertActivities(tx: Transaction, eventId: string, access: PassTypeActivity[]) {
    if (access.length === 0) return;
    const ids = access.map((entry) => entry.activityId);
    const usable = await tx
      .select({ id: activities.id })
      .from(activities)
      .where(
        and(
          eq(activities.eventId, eventId),
          eq(activities.status, 'active'),
          inArray(activities.id, ids),
        ),
      )
      .for('share');
    if (usable.length !== ids.length) throw new BadRequestException('Invalid activity');
  }

  private async readAccess(
    executor: Executor,
    eventId: string,
    passTypeId: string,
  ): Promise<PassTypeActivity[]> {
    const rows = await executor
      .select({
        activityId: eventPassTypeActivities.activityId,
        access: eventPassTypeActivities.access,
      })
      .from(eventPassTypeActivities)
      .where(
        and(
          eq(eventPassTypeActivities.eventId, eventId),
          eq(eventPassTypeActivities.passTypeId, passTypeId),
        ),
      );
    return rows.map((row) => ({
      activityId: row.activityId,
      access: row.access as PassTypeActivity['access'],
    }));
  }

  private async writeAccess(
    tx: Transaction,
    eventId: string,
    passTypeId: string,
    access: PassTypeActivity[],
  ) {
    if (access.length === 0) return;
    await tx
      .insert(eventPassTypeActivities)
      .values(access.map((entry) => ({ eventId, passTypeId, ...entry })));
  }

  private async guardName<T>(
    write: () => Promise<T>,
    message = 'An active pass type with this name already exists',
  ): Promise<T> {
    try {
      return await write();
    } catch (error) {
      if (isActiveNameConflict(error)) throw new ConflictException(message);
      throw error;
    }
  }

  private async audit(
    tx: Transaction,
    eventId: string,
    actor: CatalogActor,
    operation: Operation,
    before: AdminPassType | null,
    after: AdminPassType,
  ) {
    await tx.insert(eventCatalogAudit).values({
      eventId,
      actorUserId: actor.userId,
      actorSessionId: actor.sessionId,
      entityType: 'pass_type',
      entityId: after.id,
      operation,
      before,
      after,
    });
  }
}
