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
export function useAdminEvents() {
  const [events, setEvents] = useState<AdminEvent[]>([]);

  useEffect(() => {
    const controller = new AbortController();
    void fetch(apiUrl('/admin/events'), { credentials: 'include', signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) return;
        const value: unknown = await response.json();
        if (!controller.signal.aborted && isAdminEventList(value)) setEvents(value);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, []);

  return events;
}
