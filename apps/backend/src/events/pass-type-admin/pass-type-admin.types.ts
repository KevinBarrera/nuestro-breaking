export type PassClass = 'full' | 'general' | 'add_on';
export type RequiredPassClass = 'full' | 'general';
export type PassTypeStatus = 'active' | 'archived';
export type ActivityAccess = 'selectable' | 'included';

export type PassTypeActivity = { activityId: string; access: ActivityAccess };

// Catalog view of a pass type; also the before/after snapshot stored in event_catalog_audit.
// `activities` is sorted by activity id so snapshots compare deterministically.
export type AdminPassType = {
  id: string;
  eventId: string;
  name: string;
  passClass: PassClass;
  priceCents: number;
  requiresPassClass: RequiredPassClass | null;
  /** ISO time when online sales of this pass close (#240); null follows the event's window. */
  onlineSalesClosesAt: string | null;
  status: PassTypeStatus;
  version: number;
  activities: PassTypeActivity[];
};

export type PassTypeFields = {
  name: string;
  passClass: PassClass;
  priceCents: number;
  requiresPassClass: RequiredPassClass | null;
  onlineSalesClosesAt: Date | null;
};

export type PassTypeDraft = PassTypeFields & { activities: PassTypeActivity[] };

export type PassTypeChanges = Partial<PassTypeFields> & { expectedVersion: number };
