import {
  adminEventErrorCodes,
  eventDeleteBlockers,
  type AdminEvent,
  type AdminEventErrorCode,
  type AdminEventFailure,
  type AdminEventSummary,
  type AdminVenue,
  type EventDeleteBlocker,
} from './types';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isText = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

const isInstantOrNull = (value: unknown): value is string | null =>
  value === null || (typeof value === 'string' && !Number.isNaN(Date.parse(value)));

// Event ids become route segments, so only UUIDs are accepted.
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function readSummary(value: unknown): AdminEventSummary | null {
  if (!isRecord(value)) return null;
  const { id, name, slug, folioPrefix, archivedAt } = value;
  if (typeof id !== 'string' || !uuid.test(id) || !isText(name)) return null;
  if (!isText(slug) || !isText(folioPrefix) || !isInstantOrNull(archivedAt)) return null;
  return { id, name, slug, folioPrefix, archivedAt };
}

// The whole list is rejected when any entry is malformed, so the screen never shows a
// partial list.
export function readEventSummaries(value: unknown): AdminEventSummary[] | null {
  if (!Array.isArray(value)) return null;
  const events = value.map(readSummary);
  return events.every((event) => event !== null) ? events : null;
}

export function readAdminEvent(value: unknown): AdminEvent | null {
  const summary = readSummary(value);
  if (!summary || !isRecord(value)) return null;
  const { timeZone, startsAt, endsAt, salesEnabled } = value;
  if (!isText(timeZone) || !isInstantOrNull(startsAt) || !isInstantOrNull(endsAt)) return null;
  if (typeof salesEnabled !== 'boolean') return null;
  return { ...summary, timeZone, startsAt, endsAt, salesEnabled };
}

export function readVenue(value: unknown): AdminVenue | null {
  if (!isRecord(value) || !isText(value.id) || typeof value.name !== 'string') return null;
  return { id: value.id, name: value.name };
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
