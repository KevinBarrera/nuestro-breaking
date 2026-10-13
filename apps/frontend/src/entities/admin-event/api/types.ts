// Admin event lifecycle API shapes (#213); see docs/contracts/admin-event-lifecycle.md.

// One event as the admin API returns it: each row of `GET /admin/events` and the answer of
// create, edit, archive and restore. Dates are ISO in UTC, or null; `archivedAt` is null while
// active. `salesEnabled` is only the switch: whether sales are open now also depends on the
// sales window, which only the event sales API reports.
export type AdminEvent = {
  id: string;
  name: string;
  slug: string;
  folioPrefix: string;
  archivedAt: string | null;
  timeZone: string;
  startsAt: string | null;
  endsAt: string | null;
  salesEnabled: boolean;
};

// Dates are ISO 8601 with an offset, or null; both or neither.
export type CreateEventInput = {
  name: string;
  slug: string;
  folioPrefix: string;
  timeZone: string;
  startsAt: string | null;
  endsAt: string | null;
};

// Only these fields can change after creation; the slug and folio prefix are fixed.
export type UpdateEventInput = Partial<
  Pick<CreateEventInput, 'name' | 'timeZone' | 'startsAt' | 'endsAt'>
>;

export type AdminVenue = { id: string; name: string };

// 409 `code` values of the event and venue writes, except `event_not_empty`, which carries
// its blockers.
export const adminEventErrorCodes = [
  'slug_taken',
  'organization_ambiguous',
  'event_archived',
  'event_not_archived',
  'venue_shared',
] as const;
export type AdminEventErrorCode = (typeof adminEventErrorCodes)[number];

// What keeps an event from being deleted, in the order the backend reports them.
export const eventDeleteBlockers = [
  'activities',
  'passTypes',
  'registrations',
  'checkIns',
  'catalogAudit',
  'registrationAudit',
] as const;
export type EventDeleteBlocker = (typeof eventDeleteBlockers)[number];

// What Datos del evento reads from `GET /admin/events/:eventId/foundation`: the event, its
// venues (the venue list; there is no separate route) and what keeps it from being deleted
// (empty when it can be). `deleteBlockers` is null when the answer did not say (an older
// backend, or a kind this panel does not know); delete then relies on `409 event_not_empty`.
// Its activities are left out.
export type EventFoundation = {
  event: AdminEvent;
  venues: AdminVenue[];
  deleteBlockers: EventDeleteBlocker[] | null;
};

// `unauthorized` is a 401 (no session or role, including the CSRF prefetch); `forbidden` a 403
// (origin or CSRF check). `invalid` carries the 400 `fieldErrors` codes (never the values).
// `not_found` is an unknown event or venue. `unknown` means the request was sent but its answer
// was lost or unreadable, so a write may have been applied; `error` covers everything else.
export type AdminEventFailure =
  | { kind: 'unauthorized' }
  | { kind: 'forbidden' }
  | { kind: 'invalid'; fieldErrors: Record<string, string> }
  | { kind: 'rule'; code: AdminEventErrorCode }
  | { kind: 'not_empty'; blockers: EventDeleteBlocker[] }
  | { kind: 'not_found' }
  | { kind: 'unknown' }
  | { kind: 'error' };
