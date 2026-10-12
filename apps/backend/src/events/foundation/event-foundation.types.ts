export interface EventFoundation {
  event: {
    id: string;
    name: string;
    slug: string;
    folioPrefix: string;
    timeZone: string;
    startsAt: string | null;
    endsAt: string | null;
    windowStatus: 'bounded' | 'unbounded';
    salesEnabled: boolean;
    /** ISO date-time when the event was archived (#213 D6), or `null`. */
    archivedAt: string | null;
  };
  venues: { id: string; name: string }[];
  activities: {
    id: string;
    name: string;
    kind: string;
    venueId: string;
    startsAt: string;
    endsAt: string;
    planningStatus: 'draft';
  }[];
  deferredFields: ['priceDisplay', 'capacity', 'registrationRequirements'];
}
