import {
  eventDayKey,
  formatEventClock,
  fromZonedInput,
  type CatalogActivity,
  type EventWindow,
} from '@/entities/event-catalog';
import type { ChangeRow } from '@/shared/ui';
import { formatTimeRange, overlapping } from './activity-agenda-model';

// What the activity form holds: a day on the event clock (`YYYY-MM-DD`) and wall-clock times
// (`HH:mm`). An activity that crosses midnight ends on `endDay`; otherwise it ends on `day`.
export type ActivityDraft = {
  name: string;
  kind: string;
  venueId: string;
  day: string;
  start: string;
  endsOtherDay: boolean;
  endDay: string;
  end: string;
};

export type DayOption = { key: string; label: string; sub: string };

export type TimeCheck = { kind: 'missing' } | { kind: 'order' } | { kind: 'ok'; minutes: number };

const dayMs = 24 * 60 * 60 * 1000;

// A calendar day key read at noon UTC, so formatting it in UTC never shifts the date.
const keyDate = (key: string) => {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day, 12));
};

const keyOf = (date: Date) => date.toISOString().slice(0, 10);

const capitalize = (value: string) => `${value.charAt(0).toUpperCase()}${value.slice(1)}`;

const formatKey = (key: string, options: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat('es-MX', { timeZone: 'UTC', ...options }).format(keyDate(key));

// The "Día" options: every event day on the event clock, from the first to the last. Without
// event dates there is none and the form asks for a date instead.
export function eventDayOptions(eventWindow: EventWindow | null, timeZone: string): DayOption[] {
  if (!eventWindow) return [];
  const last = eventDayKey(eventWindow.endsAt, timeZone);
  const days: DayOption[] = [];
  for (
    let date = keyDate(eventDayKey(eventWindow.startsAt, timeZone));
    keyOf(date) <= last;
    date = new Date(date.getTime() + dayMs)
  ) {
    const key = keyOf(date);
    days.push({
      key,
      label: capitalize(formatKey(key, { weekday: 'long' })),
      sub: formatKey(key, { day: 'numeric', month: 'long' }),
    });
  }
  return days;
}

// The form's starting values: a stored activity on the event clock, or an empty one on the
// first event day with the first venue.
export function activityDraft(
  activity: CatalogActivity | undefined,
  timeZone: string,
  firstDay: string,
  firstVenueId: string,
): ActivityDraft {
  if (!activity)
    return {
      name: '',
      kind: '',
      venueId: firstVenueId,
      day: firstDay,
      start: '',
      endsOtherDay: false,
      endDay: firstDay,
      end: '',
    };
  const day = eventDayKey(activity.startsAt, timeZone);
  const endDay = eventDayKey(activity.endsAt, timeZone);
  return {
    name: activity.name,
    kind: activity.kind,
    venueId: activity.venueId,
    day,
    start: formatEventClock(activity.startsAt, timeZone),
    endsOtherDay: endDay !== day,
    endDay,
    end: formatEventClock(activity.endsAt, timeZone),
  };
}

const endDayOf = (draft: ActivityDraft) => (draft.endsOtherDay ? draft.endDay : draft.day);

// The instants the API takes, or null while a value is missing, falls in a DST gap, or the end
// is not after the start.
export function draftWindow(draft: ActivityDraft, timeZone: string) {
  const check = instants(draft, timeZone);
  return check && check.endsAt > check.startsAt ? check : null;
}

function instants(draft: ActivityDraft, timeZone: string) {
  const endDay = endDayOf(draft);
  if (!draft.day || !draft.start || !endDay || !draft.end) return null;
  const startsAt = fromZonedInput(`${draft.day}T${draft.start}`, timeZone);
  const endsAt = fromZonedInput(`${endDay}T${draft.end}`, timeZone);
  return startsAt && endsAt ? { startsAt, endsAt } : null;
}

export function checkTimes(draft: ActivityDraft, timeZone: string): TimeCheck {
  const window = instants(draft, timeZone);
  if (!window) return { kind: 'missing' };
  const minutes = (Date.parse(window.endsAt) - Date.parse(window.startsAt)) / 60000;
  return minutes > 0 ? { kind: 'ok', minutes } : { kind: 'order' };
}

// "Dura 1 h.", "Dura 1 h 30 min.", "Dura 45 min."
export function durationLabel(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (!hours) return `Dura ${rest} min.`;
  return rest ? `Dura ${hours} h ${rest} min.` : `Dura ${hours} h.`;
}

// "Sáb 21 nov" for an instant on the event clock.
function shortDay(iso: string, timeZone: string) {
  const key = eventDayKey(iso, timeZone);
  const weekday = capitalize(formatKey(key, { weekday: 'short' }).replace('.', ''));
  return `${weekday} ${formatKey(key, { day: 'numeric' })} ${formatKey(key, { month: 'short' }).replace('.', '')}`;
}

// The "Horario" of the review: "Sáb 21 nov, 10:00–11:00", or both days when it ends on another.
export function scheduleLabel(startsAt: string, endsAt: string, timeZone: string): string {
  const from = shortDay(startsAt, timeZone);
  const to = shortDay(endsAt, timeZone);
  const start = formatEventClock(startsAt, timeZone);
  const end = formatEventClock(endsAt, timeZone);
  return from === to ? `${from}, ${start}–${end}` : `${from}, ${start} – ${to}, ${end}`;
}

// "Locking 3v3 (15:00–16:00) y Popping 1v1 (15:00–16:00)": the active activities in the same
// venue whose times overlap the draft, leaving out the one being edited. Empty while the times
// are not valid.
export function overlapNames(
  draft: ActivityDraft,
  editingId: string | undefined,
  activities: CatalogActivity[],
  timeZone: string,
): string {
  const window = draftWindow(draft, timeZone);
  if (!window) return '';
  return overlapping(
    { id: editingId ?? '', venueId: draft.venueId, status: 'active', ...window },
    activities,
  )
    .map((activity) => `${activity.name} (${formatTimeRange(activity, timeZone)})`)
    .join(' y ');
}

const peopleEnrolled = (count: number) =>
  count === 1 ? '1 persona inscrita' : `${count} personas inscritas`;

// The edit summary: "4 personas inscritas. Incluida en Pase completo Breaking." Each part only
// when known (the count from the attendee lists, the passes from the pass types).
export function editSummary(enrolled: number | undefined, passes: string[] | null): string {
  const parts: string[] = [];
  if (enrolled !== undefined)
    parts.push(enrolled === 0 ? 'Sin inscritos todavía.' : `${peopleEnrolled(enrolled)}.`);
  if (passes)
    parts.push(passes.length ? `Incluida en ${passes.join(', ')}.` : 'No está en ningún pase.');
  return parts.join(' ');
}

// The review's warning when people already enrolled had the previous schedule or venue.
export function reviewWarning(enrolled: number | undefined, rows: ChangeRow[]): string | null {
  if (!enrolled) return null;
  if (!rows.some((row) => row.key === 'schedule' || row.key === 'venue')) return null;
  const verb = enrolled === 1 ? 'tenía' : 'tenían';
  return `${peopleEnrolled(enrolled)} ${verb} el horario anterior. Avísales del cambio.`;
}
