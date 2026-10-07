import { listCatalogEvents } from '@/entities/event-catalog';
import { useEffect, useState } from 'react';

export type EventNameState = 'loading' | 'resolved' | 'unavailable';

// Resolves an event's display name from GET /admin/events. It is a nicety for headers: while
// loading, on failure or when the event is not listed the name is null, so callers never fall
// back to showing the raw event ID. A result settled for another event is never returned.
// `state` tells whether the lookup is still loading or has settled (resolved or unavailable).
export function useEventName(eventId: string | undefined): {
  name: string | null;
  state: EventNameState;
} {
  const [settled, setSettled] = useState<{ eventId: string; name: string | null } | null>(null);

  useEffect(() => {
    if (!eventId) return;
    const controller = new AbortController();
    void listCatalogEvents(controller.signal)
      .then((events) => events.find((event) => event.id === eventId)?.name ?? null)
      .catch(() => null)
      .then((name) => {
        if (!controller.signal.aborted) setSettled({ eventId, name });
      });
    return () => controller.abort();
  }, [eventId]);

  if (!settled || settled.eventId !== eventId) return { name: null, state: 'loading' };
  return settled.name
    ? { name: settled.name, state: 'resolved' }
    : { name: null, state: 'unavailable' };
}
