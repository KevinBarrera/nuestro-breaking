import { listCatalogEvents } from '@/entities/event-catalog';
import { useEffect, useState } from 'react';

// Resolves an event's display name from GET /admin/events. It is a nicety for headers: while
// loading, on failure or when the event is not listed it is null, so callers never fall back
// to showing the raw event ID. A name resolved for another event is never returned.
export function useEventName(eventId: string | undefined) {
  const [resolved, setResolved] = useState<{ eventId: string; name: string } | null>(null);

  useEffect(() => {
    if (!eventId) return;
    const controller = new AbortController();
    listCatalogEvents(controller.signal)
      .then((events) => {
        const name = events.find((event) => event.id === eventId)?.name;
        if (!controller.signal.aborted && name) setResolved({ eventId, name });
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [eventId]);

  return resolved && resolved.eventId === eventId ? resolved.name : null;
}
