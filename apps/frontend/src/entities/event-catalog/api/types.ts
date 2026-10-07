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
  status: CatalogStatus;
  version: number;
  activities: PassTypeActivity[];
};

export type PassTypeInput = {
  name: string;
  passClass: PassClass;
  priceCents: number;
  requiresPassClass: RequiredPassClass | null;
};

export type CatalogVenue = { id: string; name: string };

// An event the signed-in account may administer, as listed by `GET /admin/events`.
export type CatalogEventSummary = { id: string; name: string };

// The part of the event foundation the catalog forms need: venues and the event time zone.
export type CatalogEventContext = { timeZone: string; venues: CatalogVenue[] };

export type CatalogFailure = 'denied' | 'not-found' | 'conflict' | 'invalid' | 'error';
