import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, inArray, isNotNull, lte, or, sql } from 'drizzle-orm';
import { DATABASE_CLIENT } from '@/database/database.constants';
import { type DatabaseService } from '@/database/database.service';
import {
  activities,
  eventPassTypes,
  eventRegistrations,
  participants,
  registrationOperationAudit,
  users,
} from '@/database/schema';
import {
  type CatalogNames,
  detailsOf,
  encodeCursor,
  reasonOf,
  referencedIds,
} from './registration-history.projection';
import type { HistoryItem, HistoryPage, HistoryQuery } from './registration-history.types';

const audit = registrationOperationAudit;
const CORRECTION_TYPES = [
  'registration_void',
  'registration_correction',
  'registration_discipline_swap',
  'cash_correction',
];

@Injectable()
export class RegistrationHistoryService {
  constructor(@Inject(DATABASE_CLIENT) private readonly db: DatabaseService['db']) {}

  /**
   * The event's audit facts, newest first by `(created_at, id)`, as a redacted projection (#104).
   * One query for the page plus at most one per catalog table to name pass types and activities,
   * archived ones included.
   */
  async read(eventId: string, query: HistoryQuery): Promise<HistoryPage> {
    const after = query.cursor
      ? sql`(${audit.createdAt}, ${audit.id}) < (${query.cursor.createdAt}::timestamptz, ${query.cursor.id}::uuid)`
      : undefined;
    // A selection change stores no status (#170), but confirmation is never undone, so it was
    // made on a confirmed registration when the registration's confirmation precedes it.
    const corrections =
      query.filter === 'corrections'
        ? or(
            inArray(audit.operationType, CORRECTION_TYPES),
            and(
              eq(audit.operationType, 'pass_selection_change'),
              isNotNull(eventRegistrations.confirmedAt),
              lte(eventRegistrations.confirmedAt, audit.createdAt),
            ),
          )
        : undefined;
    const rows = await this.db
      .select({
        id: audit.id,
        cursorTime: sql<string>`to_char(${audit.createdAt} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`,
        createdAt: audit.createdAt,
        operationType: audit.operationType,
        actorKind: audit.actorKind,
        actorName: users.displayName,
        registrationId: audit.registrationId,
        folio: eventRegistrations.folio,
        participantName: participants.fullName,
        amountCents: audit.amountCents,
        receipt: audit.receipt,
        note: audit.note,
        beforeState: audit.beforeState,
        afterState: audit.afterState,
        facts: audit.facts,
      })
      .from(audit)
      .innerJoin(
        eventRegistrations,
        and(
          eq(eventRegistrations.eventId, audit.eventId),
          eq(eventRegistrations.id, audit.registrationId),
        ),
      )
      .innerJoin(participants, eq(participants.id, eventRegistrations.participantId))
      .leftJoin(users, eq(users.id, audit.actorUserId))
      .where(and(eq(audit.eventId, eventId), after, corrections))
      .orderBy(desc(audit.createdAt), desc(audit.id))
      .limit(query.limit + 1);

    const page = rows.slice(0, query.limit);
    const names = await this.catalogNames(eventId, referencedIds(page));
    const items = page.map((row): HistoryItem => ({
      id: row.id,
      occurredAt: row.createdAt.toISOString(),
      operationType: row.operationType,
      actor: {
        kind: row.actorKind as HistoryItem['actor']['kind'],
        name: row.actorKind === 'admin' ? row.actorName?.trim() || null : null,
      },
      registration: {
        id: row.registrationId,
        folio: row.folio,
        participantName: row.participantName,
      },
      reason: reasonOf(row),
      details: detailsOf(row, names),
    }));
    const last = page.at(-1);
    return {
      items,
      nextCursor:
        rows.length > query.limit && last
          ? encodeCursor({ createdAt: last.cursorTime, id: last.id })
          : null,
    };
  }

  private async catalogNames(
    eventId: string,
    ids: { passTypeIds: string[]; activityIds: string[] },
  ): Promise<CatalogNames> {
    const none: { id: string; name: string }[] = [];
    const [passTypes, activityRows] = await Promise.all([
      ids.passTypeIds.length
        ? this.db
            .select({ id: eventPassTypes.id, name: eventPassTypes.name })
            .from(eventPassTypes)
            .where(
              and(eq(eventPassTypes.eventId, eventId), inArray(eventPassTypes.id, ids.passTypeIds)),
            )
        : none,
      ids.activityIds.length
        ? this.db
            .select({ id: activities.id, name: activities.name })
            .from(activities)
            .where(and(eq(activities.eventId, eventId), inArray(activities.id, ids.activityIds)))
        : none,
    ]);
    return {
      passTypes: new Map(passTypes.map((row) => [row.id, row.name])),
      activities: new Map(activityRows.map((row) => [row.id, row.name])),
    };
  }
}
