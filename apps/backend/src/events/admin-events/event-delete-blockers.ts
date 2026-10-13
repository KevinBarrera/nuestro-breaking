import { type SQL, eq, sql } from 'drizzle-orm';
import type { AnyPgColumn, PgTable } from 'drizzle-orm/pg-core';
import type { DatabaseService } from '@/database/database.service';
import {
  activities,
  eventCatalogAudit,
  eventCheckIns,
  eventPassTypes,
  eventRegistrations,
  events,
  registrationOperationAudit,
} from '@/database/schema';

type Database = DatabaseService['db'];
type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];

/**
 * Every kind of row that makes an event non-empty (#213 D7), mapped to the table and column that
 * hold its `event_id`. The keys, in this order, are the `blockers` of `409 event_not_empty` and
 * the foundation's `deleteBlockers`.
 */
const DELETE_BLOCKERS = {
  activities: [activities, activities.eventId],
  passTypes: [eventPassTypes, eventPassTypes.eventId],
  registrations: [eventRegistrations, eventRegistrations.eventId],
  checkIns: [eventCheckIns, eventCheckIns.eventId],
  catalogAudit: [eventCatalogAudit, eventCatalogAudit.eventId],
  registrationAudit: [registrationOperationAudit, registrationOperationAudit.eventId],
} satisfies Record<string, [PgTable, AnyPgColumn]>;

/** What keeps an event from being deleted, as answered in `409 event_not_empty`. */
export type EventDeleteBlocker = keyof typeof DELETE_BLOCKERS;

/**
 * The blockers present for the event, in the order of `DELETE_BLOCKERS`. Delete runs it inside its
 * transaction with the event row locked; the foundation read runs it without a lock, as a hint
 * for the admin panel (delete checks again).
 */
export async function deleteBlockers(
  db: Database | Transaction,
  eventId: string,
): Promise<EventDeleteBlocker[]> {
  const kinds = Object.keys(DELETE_BLOCKERS) as EventDeleteBlocker[];
  const checks = Object.fromEntries(
    kinds.map((kind) => {
      const [table, column] = DELETE_BLOCKERS[kind];
      return [kind, sql<boolean>`exists (select 1 from ${table} where ${column} = ${eventId})`];
    }),
  ) as Record<EventDeleteBlocker, SQL<boolean>>;
  const [row] = await db.select(checks).from(events).where(eq(events.id, eventId));
  return row ? kinds.filter((kind) => row[kind]) : [];
}
