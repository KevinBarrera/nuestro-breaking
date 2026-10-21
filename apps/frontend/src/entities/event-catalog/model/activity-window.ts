// The dates an activity must stay inside (#295): the event's window as picker limits on the
// event's clock, the same field-level rules the backend applies, and their Spanish copy.
import type {
  EventWindow,
  WindowCode,
  WindowField,
  WindowFieldErrors,
} from '@/entities/event-catalog';
import { toZonedInput } from './zoned-time';

// An unbounded event has no window (`null`) and accepts any time.

const INPUT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
const MINUTE = 60_000;

/**
 * Picker limits (`datetime-local` values) of a bounded event on its clock. The inputs hold whole
 * minutes, so a limit with seconds rounds inwards (start up, end down): the pickers never offer an
 * instant outside the window, even though the server accepts the exact instants.
 */
export function windowInputBounds(eventWindow: EventWindow, timeZone: string) {
  const start = Math.ceil(Date.parse(eventWindow.startsAt) / MINUTE) * MINUTE;
  const end = Math.floor(Date.parse(eventWindow.endsAt) / MINUTE) * MINUTE;
  return {
    min: toZonedInput(new Date(start).toISOString(), timeZone),
    max: toZonedInput(new Date(end).toISOString(), timeZone),
  };
}

// "Fin" cannot start before the chosen "Inicio" either. Both values share one fixed format, so
// comparing them as text compares the wall-clock times.
export function endInputMin(bounds: { min: string }, startsAtInput: string): string {
  return INPUT.test(startsAtInput) && startsAtInput > bounds.min ? startsAtInput : bounds.min;
}

/**
 * Every failing field of a start/end pair (ISO instants), with the backend's precedence: a value is
 * `outside_event_window` when it is before the event start or after the event end (the bounds
 * themselves are allowed). "Fin" is `not_after_start` when it is not strictly after "Inicio", but
 * only when it is not already outside the window.
 */
export function activityWindowErrors(
  draft: { startsAt: string; endsAt: string },
  eventWindow: EventWindow | null,
): WindowFieldErrors {
  const start = Date.parse(draft.startsAt);
  const end = Date.parse(draft.endsAt);
  const outside = (value: number) =>
    !!eventWindow &&
    (value < Date.parse(eventWindow.startsAt) || value > Date.parse(eventWindow.endsAt));
  const errors: WindowFieldErrors = {};
  if (outside(start)) errors.startsAt = 'outside_event_window';
  if (outside(end)) errors.endsAt = 'outside_event_window';
  else if (start >= end) errors.endsAt = 'not_after_start';
  return errors;
}

const messages: Record<WindowField, Partial<Record<WindowCode, string>>> = {
  startsAt: { outside_event_window: 'El inicio debe estar dentro de las fechas del evento.' },
  endsAt: {
    outside_event_window: 'El fin debe estar dentro de las fechas del evento.',
    not_after_start: 'El fin debe ser posterior al inicio.',
  },
};

// The message of each failing field; a code that cannot happen on that field is dropped.
export function windowErrorMessages(
  errors: WindowFieldErrors,
): Partial<Record<WindowField, string>> {
  const result: Partial<Record<WindowField, string>> = {};
  for (const field of ['startsAt', 'endsAt'] as const) {
    const code = errors[field];
    const message = code && messages[field][code];
    if (message) result[field] = message;
  }
  return result;
}

const months = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];

function eventDay(iso: string, timeZone: string) {
  const [year, month, day] = toZonedInput(iso, timeZone).slice(0, 10).split('-').map(Number);
  return { year, month, day };
}

/**
 * The hint under the pickers, with the days on the event's clock: "El evento va del 21 al 22 de
 * noviembre de 2026.", "El evento es el 21 de noviembre de 2026.", and the month or year repeated
 * only when the event crosses it.
 */
export function formatEventWindow(eventWindow: EventWindow, timeZone: string): string {
  const from = eventDay(eventWindow.startsAt, timeZone);
  const to = eventDay(eventWindow.endsAt, timeZone);
  const name = (month: number) => months[month - 1];
  if (from.year === to.year && from.month === to.month) {
    return from.day === to.day
      ? `El evento es el ${from.day} de ${name(from.month)} de ${from.year}.`
      : `El evento va del ${from.day} al ${to.day} de ${name(to.month)} de ${to.year}.`;
  }
  if (from.year === to.year)
    return `El evento va del ${from.day} de ${name(from.month)} al ${to.day} de ${name(to.month)} de ${to.year}.`;
  return `El evento va del ${from.day} de ${name(from.month)} de ${from.year} al ${to.day} de ${name(to.month)} de ${to.year}.`;
}
