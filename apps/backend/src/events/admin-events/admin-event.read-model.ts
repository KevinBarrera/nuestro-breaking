import { events } from '@/database/schema';

/**
 * One event as the admin API returns it: the items of `GET /admin/events` and the answer of
 * `POST`, `PATCH`, archive and restore (#213). Dates are ISO date-times or `null`. The list
 * carries the time zone, dates and sales switch too (T9), so the event cards need no
 * request per event; every field is a column of the `events` row.
 */
export interface AdminEvent {
  id: string;
  name: string;
  slug: string;
  folioPrefix: string;
  archivedAt: string | null;
  timeZone: string;
  startsAt: string | null;
  endsAt: string | null;
  salesEnabled: boolean;
}

type EventRow = typeof events.$inferSelect;
type AdminEventRow = Pick<
  EventRow,
  | 'id'
  | 'name'
  | 'slug'
  | 'folioPrefix'
  | 'archivedAt'
  | 'timeZone'
  | 'startsAt'
  | 'endsAt'
  | 'salesEnabled'
>;

/** The columns `toAdminEvent` needs, for `select()` and `returning()`. */
export const adminEventColumns = {
  id: events.id,
  name: events.name,
  slug: events.slug,
  folioPrefix: events.folioPrefix,
  archivedAt: events.archivedAt,
  timeZone: events.timeZone,
  startsAt: events.startsAt,
  endsAt: events.endsAt,
  salesEnabled: events.salesEnabled,
};

export function toAdminEvent(row: AdminEventRow): AdminEvent {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    folioPrefix: row.folioPrefix,
    archivedAt: row.archivedAt?.toISOString() ?? null,
    timeZone: row.timeZone,
    startsAt: row.startsAt?.toISOString() ?? null,
    endsAt: row.endsAt?.toISOString() ?? null,
    salesEnabled: row.salesEnabled,
  };
}
