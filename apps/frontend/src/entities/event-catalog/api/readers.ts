import {
  activityAccessValues,
  catalogStatuses,
  passClasses,
  requiredPassClasses,
  type ActivityWindowProblem,
  type CatalogActivity,
  type CatalogEventContext,
  type CatalogEventSummary,
  type CatalogPassType,
  type EventWindow,
  type PassTypeActivity,
  type WindowCode,
  type WindowField,
} from './types';

// Manual response validation: a malformed payload is treated as a failed request, never shown.
function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function oneOf<T extends string>(values: readonly T[], value: unknown): value is T {
  return typeof value === 'string' && values.some((known) => known === value);
}

function text(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function instant(value: unknown): value is string {
  return typeof value === 'string' && !Number.isNaN(Date.parse(value));
}

function version(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0;
}

export function isCatalogActivity(value: unknown, eventId: string): value is CatalogActivity {
  const row = record(value);
  return (
    !!row &&
    text(row.id) &&
    row.eventId === eventId &&
    text(row.venueId) &&
    text(row.kind) &&
    text(row.name) &&
    instant(row.startsAt) &&
    instant(row.endsAt) &&
    oneOf(catalogStatuses, row.status) &&
    version(row.version)
  );
}

export function isCatalogEventSummary(value: unknown): value is CatalogEventSummary {
  const row = record(value);
  return !!row && text(row.id) && text(row.name);
}

function isPassTypeActivity(value: unknown): value is PassTypeActivity {
  const row = record(value);
  return !!row && text(row.activityId) && oneOf(activityAccessValues, row.access);
}

export function isCatalogPassType(value: unknown, eventId: string): value is CatalogPassType {
  const row = record(value);
  return (
    !!row &&
    text(row.id) &&
    row.eventId === eventId &&
    text(row.name) &&
    oneOf(passClasses, row.passClass) &&
    Number.isSafeInteger(row.priceCents) &&
    (row.priceCents as number) >= 0 &&
    (row.requiresPassClass === null || oneOf(requiredPassClasses, row.requiresPassClass)) &&
    (row.onlineSalesClosesAt === null || instant(row.onlineSalesClosesAt)) &&
    oneOf(catalogStatuses, row.status) &&
    version(row.version) &&
    Array.isArray(row.activities) &&
    row.activities.every(isPassTypeActivity)
  );
}

function validTimeZone(value: unknown): value is string {
  if (!text(value)) return false;
  try {
    new Intl.DateTimeFormat('es-MX', { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

export function readEventContext(value: unknown): CatalogEventContext | null {
  const foundation = record(value);
  const event = record(foundation?.event);
  const venues = foundation?.venues;
  if (!event || !validTimeZone(event.timeZone) || !Array.isArray(venues)) return null;
  const parsed = venues.map((venue: unknown) => {
    const row = record(venue);
    return row && text(row.id) && text(row.name) ? { id: row.id, name: row.name } : null;
  });
  if (parsed.some((venue) => venue === null)) return null;
  return {
    timeZone: event.timeZone,
    venues: parsed as CatalogEventContext['venues'],
    eventWindow: readWindow(event.startsAt, event.endsAt),
  };
}

// A bounded event has both dates, in order; anything else counts as unbounded.
function readWindow(startsAt: unknown, endsAt: unknown): EventWindow | null {
  if (!instant(startsAt) || !instant(endsAt) || Date.parse(startsAt) > Date.parse(endsAt))
    return null;
  return { startsAt, endsAt };
}

const windowFields: readonly WindowField[] = ['startsAt', 'endsAt'];
const windowCodes: readonly WindowCode[] = ['outside_event_window', 'not_after_start'];

// Reads the 400 body of a rejected activity window (#295). Null when the body is anything else
// or names no known failing field, so the caller falls back to its generic error.
export function readActivityWindowProblem(value: unknown): ActivityWindowProblem | null {
  const body = record(value);
  const fieldErrors = record(body?.fieldErrors);
  if (!body || !fieldErrors || body.message !== 'Invalid activity window') return null;
  const known: ActivityWindowProblem['fieldErrors'] = {};
  for (const field of windowFields) {
    const code = fieldErrors[field];
    if (oneOf(windowCodes, code)) known[field] = code;
  }
  if (Object.keys(known).length === 0) return null;
  if (body.eventWindow === null) return { fieldErrors: known, eventWindow: null };
  const eventWindow = record(body.eventWindow);
  const bounds = eventWindow && readWindow(eventWindow.startsAt, eventWindow.endsAt);
  return bounds ? { fieldErrors: known, eventWindow: bounds } : null;
}
