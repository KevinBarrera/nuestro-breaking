// Shapes returned by the admin catalog API (`apps/backend/src/events/*-admin`).
export const catalogStatuses = ['active', 'archived'] as const;
export const passClasses = ['full', 'general', 'add_on'] as const;
export const requiredPassClasses = ['full', 'general'] as const;
export const activityAccessValues = ['selectable', 'included'] as const;

export type CatalogStatus = (typeof catalogStatuses)[number];
export type PassClass = (typeof passClasses)[number];
export type RequiredPassClass = (typeof requiredPassClasses)[number];
export type ActivityAccess = (typeof activityAccessValues)[number];

export type CatalogActivity = {
  id: string;
  eventId: string;
  venueId: string;
  kind: string;
  name: string;
  startsAt: string;
  endsAt: string;
  status: CatalogStatus;
  version: number;
};

export type ActivityInput = {
  name: string;
  kind: string;
  venueId: string;
  startsAt: string;
  endsAt: string;
};

export type PassTypeActivity = { activityId: string; access: ActivityAccess };

export type CatalogPassType = {
  id: string;
  eventId: string;
  name: string;
  passClass: PassClass;
  priceCents: number;
  requiresPassClass: RequiredPassClass | null;
  // When online sales of this pass close (#240); null follows the event's sales window.
  onlineSalesClosesAt: string | null;
  status: CatalogStatus;
  version: number;
  activities: PassTypeActivity[];
};

export type PassTypeInput = {
  name: string;
  passClass: PassClass;
  priceCents: number;
  requiresPassClass: RequiredPassClass | null;
  onlineSalesClosesAt: string | null;
};

// Creating a pass may also set its access in the same POST; later changes use the PUT.
export type NewPassTypeInput = PassTypeInput & { activities?: PassTypeActivity[] };

export type CatalogVenue = { id: string; name: string };

// An event the signed-in account may administer, as listed by `GET /admin/events`.
export type CatalogEventSummary = { id: string; name: string };

// The event's dates as ISO instants; a bounded event always has both.
export type EventWindow = { startsAt: string; endsAt: string };

export type WindowField = 'startsAt' | 'endsAt';
export type WindowCode = 'outside_event_window' | 'not_after_start';
export type WindowFieldErrors = Partial<Record<WindowField, WindowCode>>;

// The part of the event foundation the catalog forms need: venues, the event time zone and the
// event dates activities must stay inside (`null` for an unbounded event).
export type CatalogEventContext = {
  timeZone: string;
  venues: CatalogVenue[];
  eventWindow: EventWindow | null;
};

// The 400 `Invalid activity window` answer when it names failing fields: the field errors and
// the event window as the server read it, so the form can correct itself without another read.
export type ActivityWindowProblem = {
  fieldErrors: WindowFieldErrors;
  eventWindow: EventWindow | null;
};

export type CatalogFailure = 'denied' | 'not-found' | 'conflict' | 'invalid' | 'error';
