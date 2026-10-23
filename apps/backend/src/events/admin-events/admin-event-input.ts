import { hasControlCharacters } from '@/identity-access/password-policy';
import { FOLIO_PREFIX_PATTERN } from '@/events/registration-confirmation/registration-folio';
import { parseOffsetDateTime } from '@/events/sales/date-time';
import { isEventSlug } from '@/events/shared/event-slug';

// Pure input parsing for creating and editing events from the admin panel (#213 T1).

/** `immutable` marks a field that exists but can never change after creation (slug, folio prefix). */
export type EventFieldError = 'invalid' | 'immutable';
export type ParseResult<T> =
  { ok: true; value: T } | { ok: false; fieldErrors: Record<string, EventFieldError> };

export type CreateEventInput = {
  name: string;
  slug: string;
  folioPrefix: string;
  timeZone: string;
  startsAt: Date | null;
  endsAt: Date | null;
  city: string;
  state: string;
  country: string;
};

/**
 * Only the supplied fields. A date supplied alone must still be paired with the stored one, so the
 * caller checks the merged window with `eventWindowErrors`; location fields likewise merge with the
 * stored ones and are checked with `eventLocationErrors`.
 */
export type UpdateEventInput = Partial<{
  name: string;
  timeZone: string;
  startsAt: Date | null;
  endsAt: Date | null;
  city: string;
  state: string;
  country: string;
}>;

/** Where the event happens (#322). Events created before it have no location: all three `null`. */
export type EventLocation = { city: string | null; state: string | null; country: string | null };

const MAX_NAME = 120;
const UPDATABLE = new Set(['name', 'timeZone', 'startsAt', 'endsAt', 'city', 'state', 'country']);
const LOCATION_FIELDS = ['city', 'state', 'country'] as const;
const MAX_PLACE = 80;
// Codes `Intl` names that are not countries: unknown region, European Union, Eurozone, United
// Nations, outlying Oceania and the pseudo-locales.
const NOT_COUNTRIES = new Set(['ZZ', 'EU', 'EZ', 'UN', 'QO', 'XA', 'XB']);
const regionNames = new Intl.DisplayNames(['en'], { type: 'region' });
const IMMUTABLE = new Set(['slug', 'folioPrefix']);
// Shape of an IANA zone name (`UTC`, `America/Mexico_City`, `Etc/GMT+6`). It keeps out offsets such
// as `+01:00`, which `Intl` also accepts but which do not follow daylight saving rules.
const TIME_ZONE_SHAPE = /^[A-Za-z][A-Za-z0-9_+-]*(?:\/[A-Za-z0-9_+-]+)*$/;
const MAX_TIME_ZONE = 64;

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

/** A trimmed, non-blank name of at most 120 characters without control characters. */
function parseName(raw: unknown): string | null {
  if (typeof raw !== 'string' || hasControlCharacters(raw)) return null;
  const name = raw.trim();
  return name && name.length <= MAX_NAME ? name : null;
}

/** A trimmed, non-blank city or state of at most 80 characters without control characters. */
function parsePlace(raw: unknown): string | null {
  if (typeof raw !== 'string' || hasControlCharacters(raw)) return null;
  const place = raw.trim();
  return place && place.length <= MAX_PLACE ? place : null;
}

/** An ISO 3166-1 alpha-2 code in upper case (`mx` becomes `MX`), or `null` when not a country. */
function parseCountry(raw: unknown): string | null {
  if (typeof raw !== 'string' || !/^[A-Za-z]{2}$/.test(raw)) return null;
  const code = raw.toUpperCase();
  return !NOT_COUNTRIES.has(code) && regionNames.of(code) !== code ? code : null;
}

const parseLocationField = (key: (typeof LOCATION_FIELDS)[number], raw: unknown) =>
  key === 'country' ? parseCountry(raw) : parsePlace(raw);

/** The canonical IANA name (`america/bogota` becomes `America/Bogota`), or `null` when unknown. */
function parseTimeZone(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw.length > MAX_TIME_ZONE || !TIME_ZONE_SHAPE.test(raw))
    return null;
  try {
    return new Intl.DateTimeFormat('en-US', { timeZone: raw }).resolvedOptions().timeZone;
  } catch {
    return null;
  }
}

/** `null` for a missing or null date, `undefined` when the value is not an offset date-time. */
function parseDate(raw: unknown): Date | null | undefined {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== 'string') return undefined;
  return parseOffsetDateTime(raw) ?? undefined;
}

/**
 * Mirrors the `events_window_ck` check: both dates or neither, with the start before the end. The
 * error names the date to fix: the missing one, or the end when the order is wrong.
 */
export function eventWindowErrors(
  startsAt: Date | null,
  endsAt: Date | null,
): Record<string, 'invalid'> {
  if (startsAt === null && endsAt === null) return {};
  if (startsAt === null) return { startsAt: 'invalid' };
  if (endsAt === null || startsAt.getTime() >= endsAt.getTime()) return { endsAt: 'invalid' };
  return {};
}

/**
 * Mirrors the `events_location_ck` check: the three fields together or none, so a stored location
 * is never partial. The error names the missing fields.
 */
export function eventLocationErrors(location: EventLocation): Record<string, 'invalid'> {
  const missing = LOCATION_FIELDS.filter((key) => location[key] === null);
  if (missing.length === LOCATION_FIELDS.length) return {};
  return Object.fromEntries(missing.map((key) => [key, 'invalid' as const]));
}

/** Validates a new event. Errors name fields only and never echo the submitted values. */
export function parseCreateEventInput(body: unknown): ParseResult<CreateEventInput> {
  if (!isRecord(body)) return { ok: false, fieldErrors: { body: 'invalid' } };
  const name = parseName(body.name);
  const slug = typeof body.slug === 'string' && isEventSlug(body.slug) ? body.slug : null;
  const folioPrefix =
    typeof body.folioPrefix === 'string' && FOLIO_PREFIX_PATTERN.test(body.folioPrefix)
      ? body.folioPrefix
      : null;
  const timeZone = parseTimeZone(body.timeZone);
  const startsAt = parseDate(body.startsAt);
  const endsAt = parseDate(body.endsAt);
  const city = parsePlace(body.city);
  const state = parsePlace(body.state);
  const country = parseCountry(body.country);

  const fieldErrors: Record<string, EventFieldError> = {};
  if (!name) fieldErrors.name = 'invalid';
  if (!slug) fieldErrors.slug = 'invalid';
  if (!folioPrefix) fieldErrors.folioPrefix = 'invalid';
  if (!timeZone) fieldErrors.timeZone = 'invalid';
  if (startsAt === undefined) fieldErrors.startsAt = 'invalid';
  if (endsAt === undefined) fieldErrors.endsAt = 'invalid';
  if (!city) fieldErrors.city = 'invalid';
  if (!state) fieldErrors.state = 'invalid';
  if (!country) fieldErrors.country = 'invalid';
  if (startsAt !== undefined && endsAt !== undefined)
    Object.assign(fieldErrors, eventWindowErrors(startsAt, endsAt));
  if (
    !name ||
    !slug ||
    !folioPrefix ||
    !timeZone ||
    startsAt === undefined ||
    endsAt === undefined ||
    !city ||
    !state ||
    !country ||
    Object.keys(fieldErrors).length > 0
  )
    return { ok: false, fieldErrors };
  return {
    ok: true,
    value: { name, slug, folioPrefix, timeZone, startsAt, endsAt, city, state, country },
  };
}

/**
 * Validates an edit. Only the name, time zone, dates and location can change; the slug and folio prefix are
 * refused as `immutable` so shared links and printed folios stay valid, and any other key is
 * `invalid`. At least one field is required.
 */
export function parseUpdateEventInput(body: unknown): ParseResult<UpdateEventInput> {
  if (!isRecord(body) || Object.keys(body).length === 0)
    return { ok: false, fieldErrors: { body: 'invalid' } };

  const fieldErrors: Record<string, EventFieldError> = {};
  for (const key of Object.keys(body)) {
    if (IMMUTABLE.has(key)) fieldErrors[key] = 'immutable';
    else if (!UPDATABLE.has(key)) fieldErrors[key] = 'invalid';
  }

  const value: UpdateEventInput = {};
  if ('name' in body) {
    const name = parseName(body.name);
    if (name) value.name = name;
    else fieldErrors.name = 'invalid';
  }
  if ('timeZone' in body) {
    const timeZone = parseTimeZone(body.timeZone);
    if (timeZone) value.timeZone = timeZone;
    else fieldErrors.timeZone = 'invalid';
  }
  for (const key of ['startsAt', 'endsAt'] as const) {
    if (!(key in body)) continue;
    const date = parseDate(body[key]);
    if (date === undefined) fieldErrors[key] = 'invalid';
    else value[key] = date;
  }
  for (const key of LOCATION_FIELDS) {
    if (!(key in body)) continue;
    const place = parseLocationField(key, body[key]);
    if (place) value[key] = place;
    else fieldErrors[key] = 'invalid';
  }
  if (value.startsAt !== undefined && value.endsAt !== undefined)
    Object.assign(fieldErrors, eventWindowErrors(value.startsAt, value.endsAt));

  if (Object.keys(fieldErrors).length > 0) return { ok: false, fieldErrors };
  return { ok: true, value };
}

/**
 * Validates a delete request: `{ confirmSlug }` must be a string. The service compares it with the
 * stored slug exactly (no trimming or case folding), answering the same `invalid` on a mismatch.
 */
export function parseDeleteEventInput(body: unknown): ParseResult<{ confirmSlug: string }> {
  if (!isRecord(body) || typeof body.confirmSlug !== 'string')
    return { ok: false, fieldErrors: { confirmSlug: 'invalid' } };
  return { ok: true, value: { confirmSlug: body.confirmSlug } };
}
