import {
  adminEventErrorCodes,
  eventDeleteBlockers,
  type AdminEvent,
  type AdminEventErrorCode,
  type AdminEventFailure,
  type AdminVenue,
  type EventDeleteBlocker,
  type EventFoundation,
} from './types';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isText = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

const isInstantOrNull = (value: unknown): value is string | null =>
  value === null || (typeof value === 'string' && !Number.isNaN(Date.parse(value)));

// Event ids become route segments, so only UUIDs are accepted.
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function readAdminEvent(value: unknown): AdminEvent | null {
  if (!isRecord(value)) return null;
  const { id, name, slug, folioPrefix, archivedAt, timeZone, startsAt, endsAt, salesEnabled } =
    value;
  if (typeof id !== 'string' || !uuid.test(id) || !isText(name)) return null;
  if (!isText(slug) || !isText(folioPrefix) || !isInstantOrNull(archivedAt)) return null;
  if (!isText(timeZone) || !isInstantOrNull(startsAt) || !isInstantOrNull(endsAt)) return null;
  if (typeof salesEnabled !== 'boolean') return null;
  return { id, name, slug, folioPrefix, archivedAt, timeZone, startsAt, endsAt, salesEnabled };
}

// The whole list is rejected when any entry is malformed, so the screen never shows a
// partial list.
export function readEventList(value: unknown): AdminEvent[] | null {
  if (!Array.isArray(value)) return null;
  const events = value.map(readAdminEvent);
  return events.every((event) => event !== null) ? events : null;
}

export function readVenue(value: unknown): AdminVenue | null {
  if (!isRecord(value) || !isText(value.id) || typeof value.name !== 'string') return null;
  return { id: value.id, name: value.name };
}

export function readEventFoundation(value: unknown): EventFoundation | null {
  if (!isRecord(value) || !Array.isArray(value.venues)) return null;
  const event = readAdminEvent(value.event);
  const venues = value.venues.map(readVenue);
  if (!event || !venues.every((venue) => venue !== null)) return null;
  return { event, venues, deleteBlockers: readDeleteBlockers(value.deleteBlockers) };
}

const isDeleteBlocker = (value: unknown): value is EventDeleteBlocker =>
  eventDeleteBlockers.some((blocker) => blocker === value);

// Only a list of known kinds is trusted; anything else means "not known", never "empty".
function readDeleteBlockers(value: unknown): EventDeleteBlocker[] | null {
  if (!Array.isArray(value) || !value.every(isDeleteBlocker)) return null;
  return eventDeleteBlockers.filter((blocker) => value.includes(blocker));
}

// Maps a failed response to what the screens need: only known codes, field error codes and
// blockers pass through; anything else is a generic error.
export function readEventFailure(status: number, body: unknown): AdminEventFailure {
  if (status === 401) return { kind: 'unauthorized' };
  if (status === 403) return { kind: 'forbidden' };
  if (status === 400) {
    const raw = isRecord(body) && isRecord(body.fieldErrors) ? body.fieldErrors : {};
    const fieldErrors = Object.fromEntries(
      Object.entries(raw).filter(
        (entry): entry is [string, string] => typeof entry[1] === 'string',
      ),
    );
    return { kind: 'invalid', fieldErrors };
  }
  if (status === 404) return { kind: 'not_found' };
  if (status === 409 && isRecord(body)) {
    if (body.code === 'event_not_empty') {
      const listed: unknown[] = Array.isArray(body.blockers) ? body.blockers : [];
      const blockers = eventDeleteBlockers.filter((blocker): blocker is EventDeleteBlocker =>
        listed.includes(blocker),
      );
      return { kind: 'not_empty', blockers };
    }
    const code = adminEventErrorCodes.find(
      (candidate): candidate is AdminEventErrorCode => candidate === body.code,
    );
    if (code) return { kind: 'rule', code };
  }
  return { kind: 'error' };
}
