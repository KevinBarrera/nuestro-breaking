import type { AttendeeLists } from '@/entities/attendee-list';
import {
  activityKinds,
  eventDayKey,
  formatEventClock,
  formatEventDay,
  formatEventWindow,
  isActivityKind,
  type ActivityKind,
  type CatalogActivity,
  type CatalogPassType,
  type EventWindow,
} from '@/entities/event-catalog';
import { historyClockLabel } from './history-feed-model';

export type AgendaTab = 'active' | 'archived';

export type AgendaFilters = {
  tab: AgendaTab;
  // `null` shows every kind.
  kind: string | null;
  query: string;
};

export type KindOption = { kind: string | null; label: string; count: number };

export type AgendaDay = { key: string; label: string; activities: CatalogActivity[] };

// Case- and accent-insensitive form for name search ("exhibicion" finds "Exhibición").
const searchable = (value: string) =>
  value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase('es')
    .trim();

const inTab = (activities: CatalogActivity[], tab: AgendaTab) =>
  activities.filter((activity) => activity.status === tab);

export function tabCounts(activities: CatalogActivity[]): Record<AgendaTab, number> {
  return {
    active: inTab(activities, 'active').length,
    archived: inTab(activities, 'archived').length,
  };
}

const kindChipLabels: Record<ActivityKind, string> = {
  competition: 'Competencias',
  workshop: 'Talleres',
  social: 'Sociales',
};

// "Todas" plus a chip per kind with activities in the tab: known kinds in the catalog order, then
// any other kind as stored. The selected kind keeps its chip (count 0) when the tab has none of
// it, so the pressed chip always explains why the agenda is filtered.
export function kindOptions(
  activities: CatalogActivity[],
  tab: AgendaTab,
  selected: string | null,
): KindOption[] {
  const shown = inTab(activities, tab);
  const counts = new Map<string, number>();
  for (const activity of shown) counts.set(activity.kind, (counts.get(activity.kind) ?? 0) + 1);
  if (selected !== null && !counts.has(selected)) counts.set(selected, 0);
  const rank = (kind: string) => {
    const index = activityKinds.indexOf(kind as ActivityKind);
    return index === -1 ? activityKinds.length : index;
  };
  const kinds = [...counts.keys()].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b, 'es'));
  return [
    { kind: null, label: 'Todas', count: shown.length },
    ...kinds.map((kind) => ({
      kind,
      label: isActivityKind(kind) ? kindChipLabels[kind] : kind,
      count: counts.get(kind) ?? 0,
    })),
  ];
}

// Filters, then groups by calendar day on the event's clock (never the browser's), with days
// and the activities inside each day in start-time order.
export function agendaDays(
  activities: CatalogActivity[],
  filters: AgendaFilters,
  timeZone: string,
): AgendaDay[] {
  const query = searchable(filters.query);
  const matches = inTab(activities, filters.tab)
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

const dayMs = 24 * 60 * 60 * 1000;

// "HH:mm–HH:mm" on the event's clock; an end on a later event day is marked ("+1 día"), since
// the row sits under its start day and a bare "00:00" end would read as the same day.
export function formatTimeRange(activity: CatalogActivity, timeZone: string): string {
  const range = `${formatEventClock(activity.startsAt, timeZone)}–${formatEventClock(activity.endsAt, timeZone)}`;
  const days = Math.round(
    (Date.parse(eventDayKey(activity.endsAt, timeZone)) -
      Date.parse(eventDayKey(activity.startsAt, timeZone))) /
      dayMs,
  );
  if (days <= 0) return range;
  return `${range} (+${days} ${days === 1 ? 'día' : 'días'})`;
}

// Other active activities in the same venue whose times overlap this one ("Mismo horario que …").
// Back-to-back times do not overlap. Informative only: saving is never blocked.
export function overlapping(
  target: Pick<CatalogActivity, 'id' | 'venueId' | 'startsAt' | 'endsAt' | 'status'>,
  activities: CatalogActivity[],
): CatalogActivity[] {
  if (target.status !== 'active') return [];
  const start = Date.parse(target.startsAt);
  const end = Date.parse(target.endsAt);
  return activities.filter(
    (other) =>
      other.id !== target.id &&
      other.status === 'active' &&
      other.venueId === target.venueId &&
      Date.parse(other.startsAt) < end &&
      start < Date.parse(other.endsAt),
  );
}

// Inscritos per activity from the attendee-lists snapshot: the registrations (confirmed or
// pending payment) with access to it. The snapshot only lists active competitions and workshops,
// so any other activity has no count.
export function enrollmentCounts(lists: AttendeeLists): Map<string, number> {
  const counts = new Map(lists.activities.map((activity) => [activity.id, 0]));
  for (const registration of lists.registrations)
    for (const { activityId } of registration.activities)
      if (counts.has(activityId)) counts.set(activityId, (counts.get(activityId) ?? 0) + 1);
  return counts;
}

export const enrolledLabel = (count: number) =>
  count === 0 ? 'Sin inscritos' : count === 1 ? '1 inscrito' : `${count} inscritos`;

// The active passes that give access to the activity, in catalog order.
export const passNames = (passTypes: CatalogPassType[], activityId: string) =>
  passTypes
    .filter(
      (passType) =>
        passType.status === 'active' &&
        passType.activities.some((link) => link.activityId === activityId),
    )
    .map((passType) => passType.name);

// "Horas de Ciudad de México. El evento va del 21 al 22 de noviembre de 2026."
export function agendaFooter(timeZone: string, eventWindow: EventWindow | null): string {
  const clock = `${historyClockLabel(timeZone)}.`;
  return eventWindow ? `${clock} ${formatEventWindow(eventWindow, timeZone)}` : clock;
}
