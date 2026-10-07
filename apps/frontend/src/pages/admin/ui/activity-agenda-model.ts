import { eventDayKey, formatEventDay, type CatalogActivity } from '@/entities/event-catalog';
import { activityKindLabel } from './catalog-copy';

// The one kind with its own empty state: workshops are announced after the competitions.
export const workshopKind = 'workshop';

export type AgendaFilters = {
  // `null` shows every kind.
  kind: string | null;
  query: string;
  showArchived: boolean;
};

export type KindOption = { kind: string; label: string; count: number };

export type AgendaDay = { key: string; label: string; activities: CatalogActivity[] };

// Case- and accent-insensitive form for name search ("exhibicion" finds "Exhibición").
const searchable = (value: string) =>
  value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase('es')
    .trim();

const visible = (activities: CatalogActivity[], showArchived: boolean) =>
  showArchived ? activities : activities.filter((activity) => activity.status === 'active');

// Kind filter options from the kinds actually present (respecting the archived toggle), sorted
// by Spanish label. Workshops always get an option so their empty state stays reachable, and the
// selected kind keeps its chip (count 0) when its last visible activity is archived or hidden,
// so the pressed chip always explains why the agenda is filtered.
export function kindOptions(
  activities: CatalogActivity[],
  showArchived: boolean,
  selected: string | null,
): KindOption[] {
  const counts = new Map<string, number>([[workshopKind, 0]]);
  if (selected !== null) counts.set(selected, 0);
  for (const activity of visible(activities, showArchived))
    counts.set(activity.kind, (counts.get(activity.kind) ?? 0) + 1);
  return [...counts]
    .map(([kind, count]) => ({ kind, label: activityKindLabel(kind), count }))
    .sort((a, b) => a.label.localeCompare(b.label, 'es'));
}

export function countVisible(activities: CatalogActivity[], showArchived: boolean) {
  return visible(activities, showArchived).length;
}

// Filters, then groups by calendar day on the event's clock (never the browser's), with days
// and the activities inside each day in start-time order.
export function agendaDays(
  activities: CatalogActivity[],
  filters: AgendaFilters,
  timeZone: string,
): AgendaDay[] {
  const query = searchable(filters.query);
  const matches = visible(activities, filters.showArchived)
    .filter((activity) => filters.kind === null || activity.kind === filters.kind)
    .filter((activity) => !query || searchable(activity.name).includes(query))
    .sort(
      (a, b) =>
        Date.parse(a.startsAt) - Date.parse(b.startsAt) || a.name.localeCompare(b.name, 'es'),
    );
  const days = new Map<string, AgendaDay>();
  for (const activity of matches) {
    const key = eventDayKey(activity.startsAt, timeZone);
    const day = days.get(key) ?? {
      key,
      label: formatEventDay(activity.startsAt, timeZone),
      activities: [],
    };
    day.activities.push(activity);
    days.set(key, day);
  }
  return [...days.values()];
}
