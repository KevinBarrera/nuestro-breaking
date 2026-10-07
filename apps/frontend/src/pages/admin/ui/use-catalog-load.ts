import { catalogFailure, type CatalogFailure } from '@/entities/event-catalog';
import { useCallback, useEffect, useState } from 'react';

export type CatalogLoadState<T> =
  | { status: 'loading' }
  | { status: 'failed'; failure: CatalogFailure }
  | { status: 'ready'; data: T };

// Loads catalog data with an abortable read; `reload` refetches while keeping the last data
// visible, so a refresh after a write does not blank the screen.
export function useCatalogLoad<T>(load: (signal: AbortSignal) => Promise<T>) {
  const [state, setState] = useState<CatalogLoadState<T>>({ status: 'loading' });
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setState({ status: 'ready', data });
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted)
          setState({ status: 'failed', failure: catalogFailure(error) });
      });
    return () => controller.abort();
  }, [load, revision]);

  const reload = useCallback(() => setRevision((value) => value + 1), []);
  return { state, reload };
}
