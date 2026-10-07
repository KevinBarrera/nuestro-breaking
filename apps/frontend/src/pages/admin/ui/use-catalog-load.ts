import { catalogFailure, type CatalogFailure } from '@/entities/event-catalog';
import { useCallback, useEffect, useRef, useState } from 'react';

export type CatalogLoadState<T> =
  | { status: 'loading' }
  | { status: 'failed'; failure: CatalogFailure }
  // `loaded` is the last server read; `data` also carries confirmed writes applied in place.
  | { status: 'ready'; data: T; loaded: T; refreshFailure: CatalogFailure | null };

// Loads catalog data with an abortable read; `reload` refetches while keeping the last data
// visible, so a refresh after a write does not blank the screen. A failed refresh keeps the
// previous data and reports `refreshFailure` instead of replacing the page with an error.
// `update` applies a confirmed write and aborts any read still in flight, since that read may
// have been answered before the write and would otherwise restore the older data.
export function useCatalogLoad<T>(load: (signal: AbortSignal) => Promise<T>) {
  const [state, setState] = useState<CatalogLoadState<T>>({ status: 'loading' });
  const [revision, setRevision] = useState(0);
  const inFlight = useRef<AbortController | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    inFlight.current = controller;
    load(controller.signal)
      .then((data) => {
        if (!controller.signal.aborted)
          setState({ status: 'ready', data, loaded: data, refreshFailure: null });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        const failure = catalogFailure(error);
        setState((previous) =>
          previous.status === 'ready'
            ? { ...previous, refreshFailure: failure }
            : { status: 'failed', failure },
        );
      });
    return () => controller.abort();
  }, [load, revision]);

  const reload = useCallback(() => setRevision((value) => value + 1), []);
  // Applies a confirmed write response to the loaded data without another read.
  const update = useCallback((change: (data: T) => T) => {
    inFlight.current?.abort();
    setState((previous) =>
      previous.status === 'ready' ? { ...previous, data: change(previous.data) } : previous,
    );
  }, []);
  return { state, reload, update };
}
