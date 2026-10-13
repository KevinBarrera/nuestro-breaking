import { events } from '@/database/schema';

/** One row of `GET /admin/events` (#213 T2). `archivedAt` is an ISO date-time or `null`. */
export interface AdminEventSummary {
  id: string;
  name: string;
  slug: string;
  folioPrefix: string;
  archivedAt: string | null;
}

/** The event returned by `POST /admin/events`. */
export interface AdminEvent extends AdminEventSummary {
  timeZone: string;
  startsAt: string | null;
  endsAt: string | null;
  salesEnabled: boolean;
}

type EventRow = typeof events.$inferSelect;
type SummaryRow = Pick<EventRow, 'id' | 'name' | 'slug' | 'folioPrefix' | 'archivedAt'>;
type AdminEventRow = SummaryRow &
  Pick<EventRow, 'timeZone' | 'startsAt' | 'endsAt' | 'salesEnabled'>;

/** The columns `toAdminEventSummary` needs, for `select()` and `returning()`. */
export const adminEventSummaryColumns = {
  id: events.id,
  name: events.name,
  slug: events.slug,
  folioPrefix: events.folioPrefix,
  archivedAt: events.archivedAt,
};

/** The columns `toAdminEvent` needs. */
export const adminEventColumns = {
  ...adminEventSummaryColumns,
  timeZone: events.timeZone,
  startsAt: events.startsAt,
  endsAt: events.endsAt,
  salesEnabled: events.salesEnabled,
};

export function toAdminEventSummary(row: SummaryRow): AdminEventSummary {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    folioPrefix: row.folioPrefix,
    archivedAt: row.archivedAt?.toISOString() ?? null,
  };
}

export function toAdminEvent(row: AdminEventRow): AdminEvent {
  return {
    ...toAdminEventSummary(row),
    timeZone: row.timeZone,
    startsAt: row.startsAt?.toISOString() ?? null,
    endsAt: row.endsAt?.toISOString() ?? null,
    salesEnabled: row.salesEnabled,
  };
}
