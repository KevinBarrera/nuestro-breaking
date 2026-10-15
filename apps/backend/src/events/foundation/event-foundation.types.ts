import type { EventDeleteBlocker } from '@/events/admin-events/event-delete-blockers';

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
  /**
   * What keeps the event from being deleted (#213 T10), in the order of `409 event_not_empty`;
   * empty when it can be deleted. Read without a lock, so delete checks again.
   */
  deleteBlockers: EventDeleteBlocker[];
  deferredFields: ['priceDisplay', 'capacity', 'registrationRequirements'];
}
