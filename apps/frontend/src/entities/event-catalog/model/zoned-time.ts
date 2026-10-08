// Conversions between instants and `datetime-local` values in the event's time zone, so
// organizers enter schedule times as event-local wall-clock times regardless of their browser.
const INPUT = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/;

function wallClock(instant: number, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).formatToParts(new Date(instant));
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((entry) => entry.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}T${part('hour')}:${part('minute')}`;
}

function asUtc(value: string) {
  const match = INPUT.exec(value);
  if (!match) return null;
  const [, year, month, day, hour, minute] = match.map(Number);
  return Date.UTC(year, month - 1, day, hour, minute);
}

export function toZonedInput(iso: string, timeZone: string): string {
  return wallClock(Date.parse(iso), timeZone);
}

// Returns null for malformed values and for wall-clock times skipped by a DST change.
export function fromZonedInput(value: string, timeZone: string): string | null {
  const target = asUtc(value);
  if (target === null) return null;
  let instant = target;
  for (let step = 0; step < 2; step++) {
    const offset = (asUtc(wallClock(instant, timeZone)) ?? target) - instant;
    instant = target - offset;
  }
  return wallClock(instant, timeZone) === value ? new Date(instant).toISOString() : null;
}

export function formatEventTime(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat('es-MX', {
    dateStyle: 'medium',
    timeStyle: 'short',
    hourCycle: 'h23',
    timeZone,
  }).format(new Date(iso));
}

// Calendar day (`YYYY-MM-DD`) of an instant on the event's clock, for grouping by day.
export function eventDayKey(iso: string, timeZone: string): string {
  return toZonedInput(iso, timeZone).slice(0, 10);
}

// Wall-clock time (`HH:mm`) of an instant on the event's clock.
export function formatEventClock(iso: string, timeZone: string): string {
  return toZonedInput(iso, timeZone).slice(11);
}

// Spanish day heading on the event's clock, e.g. "Sábado 21 de noviembre".
export function formatEventDay(iso: string, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('es-MX', {
    timeZone,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).formatToParts(new Date(iso));
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((entry) => entry.type === type)?.value ?? '';
  const weekday = part('weekday');
  return `${weekday.charAt(0).toUpperCase()}${weekday.slice(1)} ${part('day')} de ${part('month')}`;
}
