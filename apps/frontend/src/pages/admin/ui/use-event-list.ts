import {
  adminEventFailure,
  listAdminEvents,
  type AdminEventFailure,
  type AdminEvent,
} from '@/entities/admin-event';
import { useCallback, useEffect, useState } from 'react';

export type EventListState =
  | { status: 'loading' }
  | { status: 'failed'; failure: AdminEventFailure }
  | { status: 'ready'; events: AdminEvent[]; refreshFailed: boolean };

// Loads the event list with an abortable read. `withArchived` also asks for archived events
// (global admins only: nobody else can restore them). `reload` keeps the last list visible
// while it refetches, so a refresh after a restore does not blank the screen; when that
// refetch fails, the last list stays and `refreshFailed` tells the screen it may be stale.
export function useEventList(withArchived: boolean) {
  const [state, setState] = useState<EventListState>({ status: 'loading' });
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    listAdminEvents(controller.signal, { archived: withArchived })
      .then((events) => {
        if (!controller.signal.aborted) setState({ status: 'ready', events, refreshFailed: false });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        const failure = adminEventFailure(error);
        setState((previous) =>
          previous.status === 'ready'
            ? { ...previous, refreshFailed: true }
            : { status: 'failed', failure },
        );
      });
    return () => controller.abort();
  }, [withArchived, revision]);

  const reload = useCallback(() => setRevision((value) => value + 1), []);
  return { state, reload };
}
