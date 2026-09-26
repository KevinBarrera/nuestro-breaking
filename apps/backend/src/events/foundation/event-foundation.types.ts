export interface EventFoundation {
  event: {
    id: string;
    name: string;
    timeZone: string;
    startsAt: string | null;
    endsAt: string | null;
    windowStatus: 'bounded' | 'unbounded';
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
