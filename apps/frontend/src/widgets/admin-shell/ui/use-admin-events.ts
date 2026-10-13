import { listAdminEvents, type AdminEvent } from '@/entities/admin-event';
import { useEffect, useState } from 'react';

// The selector only needs each event's id and name.
export type ShellEvent = Pick<AdminEvent, 'id' | 'name'>;

// Loads the events this account may manage; a failure keeps the last list, or leaves it
// empty, so the selector simply stays hidden. Pages keep their own detailed loading and error
// states. When the URL names an event the list lacks (one just created), it reads the list
// again, once per event id. An archived event stays out of the list (#213), so the selector
// stays hidden on its screens.
export function useAdminEvents(currentEventId?: string) {
  const [events, setEvents] = useState<ShellEvent[] | null>(null);
  const [refetchedFor, setRefetchedFor] = useState<string | null>(null);
  const missing =
    events !== null &&
    currentEventId !== undefined &&
    currentEventId !== refetchedFor &&
    !events.some((event) => event.id === currentEventId);
  if (missing) setRefetchedFor(currentEventId);

  useEffect(() => {
    const controller = new AbortController();
    listAdminEvents(controller.signal)
      .then((list) => {
        if (!controller.signal.aborted) setEvents(list);
      })
      .catch(() => {
        if (!controller.signal.aborted) setEvents((previous) => previous ?? []);
      });
    return () => controller.abort();
  }, [refetchedFor]);

  return events ?? [];
}
