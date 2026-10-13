import { apiUrl } from '@/shared/api';
import { useEffect, useState } from 'react';

export type AdminEvent = { id: string; name: string };

function isAdminEventList(value: unknown): value is AdminEvent[] {
  return (
    Array.isArray(value) &&
    value.every((entry: unknown) => {
      if (!entry || typeof entry !== 'object') return false;
      const candidate = entry as Record<string, unknown>;
      return typeof candidate.id === 'string' && typeof candidate.name === 'string';
    })
  );
}

// Loads the events this account may manage; any failure leaves the list empty so the
// selector simply stays hidden. Pages keep their own detailed loading and error states.
// When the URL names an event the list lacks (one just created), it reads the list again,
// once per event id. An archived event stays out of the list (#213), so the selector stays
// hidden on its screens.
export function useAdminEvents(currentEventId?: string) {
  const [events, setEvents] = useState<AdminEvent[] | null>(null);
  const [refetchedFor, setRefetchedFor] = useState<string | null>(null);
  const missing =
    events !== null &&
    currentEventId !== undefined &&
    currentEventId !== refetchedFor &&
    !events.some((event) => event.id === currentEventId);
  if (missing) setRefetchedFor(currentEventId);

  useEffect(() => {
    const controller = new AbortController();
    void fetch(apiUrl('/admin/events'), { credentials: 'include', signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) return setEvents((previous) => previous ?? []);
        const value: unknown = await response.json();
        if (!controller.signal.aborted) setEvents(isAdminEventList(value) ? value : []);
      })
      .catch(() => {
        if (!controller.signal.aborted) setEvents((previous) => previous ?? []);
      });
    return () => controller.abort();
  }, [refetchedFor]);

  return events ?? [];
}
