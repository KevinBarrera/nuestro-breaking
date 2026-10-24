import { Inject, Injectable } from '@nestjs/common';
import { alias } from 'drizzle-orm/pg-core';
import { and, desc, eq, exists, inArray, isNotNull, lte, or, sql, type SQL } from 'drizzle-orm';
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
  REASON_TYPES,
  reasonOf,
  referencedIds,
} from './registration-history.projection';
import type {
  HistoryCounts,
  HistoryFilter,
  HistoryItem,
  HistoryPage,
  HistoryQuery,
} from './registration-history.types';

const audit = registrationOperationAudit;
const origin = alias(registrationOperationAudit, 'origin');
const CORRECTION_TYPES = [
  'registration_void',
  'registration_correction',
  'registration_discipline_swap',
  'cash_correction',
];

// Lower case without accents, so the search ignores both; Spanish letters only, as there is no
// `unaccent` extension (#356).
const ACCENTED = 'áàäâãéèëêíìïîóòöôõúùüûñç';
const PLAIN = 'aaaaaeeeeiiiiooooouuuunc';
const fold = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
const folded = (column: SQL) => sql`translate(lower(${column}), ${ACCENTED}, ${PLAIN})`;

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
      .where(
        and(
          eq(audit.eventId, eventId),
          this.searchMatch(query.q),
          this.kindMatch(query.filter),
          after,
        ),
      )
      .orderBy(desc(audit.createdAt), desc(audit.id))
      .limit(query.limit + 1);

    const page = rows.slice(0, query.limit);
    const counts = await this.counts(eventId, query.q);
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
      counts,
    };
  }

  // The operations each filter keeps (#104, #356); `all` keeps everything.
  private kindMatch(filter: HistoryFilter): SQL | undefined {
    if (filter === 'corrections')
      // A selection change stores no status (#170), but confirmation is never undone, so it was
      // made on a confirmed registration when the registration's confirmation precedes it.
      return or(
        inArray(audit.operationType, CORRECTION_TYPES),
        and(
          eq(audit.operationType, 'pass_selection_change'),
          isNotNull(eventRegistrations.confirmedAt),
          lte(eventRegistrations.confirmedAt, audit.createdAt),
        ),
      );
    // The facts the screen groups into one on-site registration: the registration itself, and its
    // passes and cash payment when the registration was created at the table.
    if (filter === 'on_site')
      return or(
        eq(audit.operationType, 'manual_registration'),
        and(
          inArray(audit.operationType, ['pass_assignment', 'cash_confirmation']),
          exists(
            this.db
              .select({ id: origin.id })
              .from(origin)
              .where(
                and(
                  eq(origin.eventId, audit.eventId),
                  eq(origin.registrationId, audit.registrationId),
                  eq(origin.operationType, 'manual_registration'),
                ),
              ),
          ),
        ),
      );
    if (filter === 'complimentary') return eq(audit.operationType, 'complimentary_confirmation');
    return undefined;
  }

  // Name or AKA, folio, receipt, or a reason the history shows, ignoring case and accents (#356).
  // A folio also matches without its hyphen when the search is a bare code.
  private searchMatch(q: string | null): SQL | undefined {
    if (!q) return undefined;
    // Treat SQL LIKE metacharacters as literal user input, not history-wide wildcards.
    const like = (value: string) => `%${value.replace(/[\\%_]/g, '\\$&')}%`;
    const pattern = like(fold(q));
    const matches = (column: SQL) => sql`${folded(column)} LIKE ${pattern}`;
    const bareCode = /^[a-z0-9]+$/.test(fold(q));
    return or(
      matches(sql`${participants.fullName}`),
      matches(sql`${participants.stageName}`),
      matches(sql`${eventRegistrations.folio}`),
      bareCode
        ? sql`replace(lower(${eventRegistrations.folio}), '-', '') LIKE ${pattern}`
        : undefined,
      matches(sql`${audit.receipt}`),
      // The previous and new receipt of a cash correction.
      and(
        eq(audit.operationType, 'cash_correction'),
        or(
          matches(sql`${audit.beforeState} ->> 'receipt'`),
          matches(sql`${audit.afterState} ->> 'receipt'`),
        ),
      ),
      and(inArray(audit.operationType, REASON_TYPES), matches(sql`${audit.note}`)),
    );
  }

  private async counts(eventId: string, q: string | null): Promise<HistoryCounts> {
    const countOf = (match: SQL | undefined) =>
      sql<number>`count(*) filter (where ${match ?? sql`true`})::int`;
    const [row] = await this.db
      .select({
        all: countOf(undefined),
        corrections: countOf(this.kindMatch('corrections')),
        on_site: countOf(eq(audit.operationType, 'manual_registration')),
        complimentary: countOf(this.kindMatch('complimentary')),
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
      .where(and(eq(audit.eventId, eventId), this.searchMatch(q)));
    return row;
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
