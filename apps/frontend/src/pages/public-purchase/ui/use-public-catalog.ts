import {
  getPublicCatalog,
  publicEventFailure,
  type PublicCatalog,
  type PublicEventFailure,
} from '@/entities/public-event';
import { useEffect, useState } from 'react';

export type CatalogState =
  | { status: 'loading' }
  | { status: 'ready'; catalog: PublicCatalog }
  | { status: 'failed'; failure: PublicEventFailure };

// Loads one event's public catalog; `retry` asks again. Each result is tagged with its attempt,
// so a retry shows loading again without resetting state inside the effect.
export function usePublicCatalog(slug: string) {
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{ attempt: number; state: CatalogState } | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    getPublicCatalog(slug, controller.signal).then(
      (catalog) => setResult({ attempt, state: { status: 'ready', catalog } }),
      (error: unknown) => {
        if (controller.signal.aborted) return;
        setResult({ attempt, state: { status: 'failed', failure: publicEventFailure(error) } });
      },
    );
    return () => controller.abort();
  }, [slug, attempt]);

  const state: CatalogState = result?.attempt === attempt ? result.state : { status: 'loading' };
  return { state, retry: () => setAttempt((current) => current + 1) };
}
