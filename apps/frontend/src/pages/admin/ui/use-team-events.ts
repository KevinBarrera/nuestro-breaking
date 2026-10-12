import { listCatalogEvents, type CatalogEventSummary } from '@/entities/event-catalog';
import { useCallback, useEffect, useState } from 'react';

export type TeamEventsState =
  | { status: 'loading' }
  | { status: 'failed' }
  | { status: 'ready'; events: Pick<CatalogEventSummary, 'id' | 'name'>[] };

// The events a global admin can grant: every event from `GET /admin/events`.
export function useTeamEvents(enabled: boolean) {
  const [state, setState] = useState<TeamEventsState>({ status: 'loading' });
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    listCatalogEvents(controller.signal)
      .then((events) => {
        if (!controller.signal.aborted) setState({ status: 'ready', events });
      })
      .catch(() => {
        if (!controller.signal.aborted) setState({ status: 'failed' });
      });
    return () => controller.abort();
  }, [enabled, revision]);

  const retry = useCallback(() => {
    setState({ status: 'loading' });
    setRevision((value) => value + 1);
  }, []);
  return { events: state, retry };
}
