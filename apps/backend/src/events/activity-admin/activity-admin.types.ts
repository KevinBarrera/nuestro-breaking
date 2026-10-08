export type ActivityStatus = 'active' | 'archived';

// Catalog view of an activity; also the before/after snapshot stored in event_catalog_audit.
export type AdminActivity = {
  id: string;
  eventId: string;
  venueId: string;
  kind: string;
  name: string;
  startsAt: string;
  endsAt: string;
  status: ActivityStatus;
  version: number;
};

export type ActivityDraft = {
  venueId: string;
  kind: string;
  name: string;
  startsAt: Date;
  endsAt: Date;
};

export type ActivityChanges = Partial<ActivityDraft> & { expectedVersion: number };

export type CatalogActor = { userId: string; sessionId: string };
